from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (Administration, Alert, AuditLog, Hospitalization, NurseAssignment, Prescription,
                      PrescriptionVersion, User, now)
from ..security import current_user, require
from ..serial import LOCAL_TZ, alert_out, local_now, version_out
from ..services import audit, notify, verify_audit_chain

router = APIRouter()
BLOCKED_OR_OPEN = ["pendiente", "en_preparacion", "en_verificacion", "bloqueado"]


def _scope_alerts(user: User):
    q = select(Alert)
    if user.rol == "medico":
        return q.where(Alert.medico_id == user.id)
    return q.join(Administration, Alert.administration_id == Administration.id) \
        .join(Prescription, Administration.prescription_id == Prescription.id) \
        .join(NurseAssignment, NurseAssignment.hospitalization_id == Prescription.hospitalization_id) \
        .where(NurseAssignment.nurse_id == user.id)


@router.get("/alerts")
def list_alerts(estado: str = "", severidad: str = "", tipo: str = "", db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    q = _scope_alerts(user)
    if estado:
        q = q.where(Alert.estado == estado)
    if severidad:
        q = q.where(Alert.severidad == severidad)
    if tipo:
        q = q.where(Alert.tipo == tipo)
    return [alert_out(a) for a in db.scalars(q.order_by(Alert.id.desc()).limit(500)).unique()]


def _get(db: Session, user: User, aid: int) -> Alert:
    a = db.scalars(select(Alert).where(Alert.id == aid).with_for_update(of=Alert)).first()
    if not a:
        raise HTTPException(404, "Alerta no encontrada")
    if user.rol == "medico" and a.medico_id != user.id:
        raise HTTPException(403, "Alerta de otro médico")
    if user.rol == "enfermera" and not db.scalar(
            select(NurseAssignment.id).join(Prescription, Prescription.hospitalization_id ==
                                            NurseAssignment.hospitalization_id)
            .where(NurseAssignment.nurse_id == user.id, Prescription.id == a.prescription_id)):
        raise HTTPException(403, "Paciente no asignado")
    return a


class ReviewIn(BaseModel):
    nota: str = Field(min_length=5, max_length=1000)


@router.post("/alerts/{aid}/request-review")
def request_review(aid: int, data: ReviewIn, request: Request, db: Session = Depends(get_db),
                   user: User = Depends(require("enfermera"))):
    a = _get(db, user, aid)
    if a.estado == "resuelta":
        raise HTTPException(409, "La alerta ya está resuelta")
    a.estado, a.nota_revision = "pendiente_revision", data.nota
    notify(db, a.medico_id, "solicitud_revision", "Solicitud de revisión",
           f"{user.nombre_completo} solicita revisar ALR-{a.id:05d} "
           f"({a.patient.nombre_completo}): {data.nota}", "/alertas", "critical")
    audit(db, user, "solicitar_revision", "alert", a.id, {"nota": data.nota},
          request.client.host if request.client else None)
    db.commit()
    return alert_out(a)


@router.post("/alerts/{aid}/resolve")
def resolve(aid: int, data: ReviewIn, request: Request, db: Session = Depends(get_db),
            user: User = Depends(require("medico"))):
    a = _get(db, user, aid)
    if a.estado == "resuelta":
        raise HTTPException(409, "La alerta ya está resuelta")
    a.estado, a.resolucion, a.resuelta_por, a.resuelta_en = "resuelta", data.nota, user.id, now()
    adm = db.get(Administration, a.administration_id) if a.administration_id else None
    if adm and adm.estado == "bloqueado" and not db.scalar(
            select(func.count()).select_from(Alert).where(Alert.administration_id == adm.id, Alert.estado != "resuelta",
                                                          Alert.severidad == "critica")):
        adm.estado = "pendiente"  # debe repetirse la preparación verificada: resolver no equivale a administrar
    notify(db, a.nurse_id, "revision_respondida", "Respuesta a solicitud de revisión",
           f"Dr./Dra. {user.nombre_completo} resolvió ALR-{a.id:05d}: {data.nota}", "/enfermeria", "info")
    audit(db, user, "resolver", "alert", a.id, {"resolucion": data.nota},
          request.client.host if request.client else None)
    db.commit()
    return alert_out(a)


# --------------------------------------------------------------- estadísticas
def _series(db: Session, scope_q, days=14):
    start = local_now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    rows = db.scalars(scope_q.where(Alert.created_at >= start)).unique().all()
    buckets = {(start + timedelta(days=i)).strftime("%d/%m"): {"criticas": 0, "advertencias": 0} for i in range(days)}
    for r in rows:
        k = r.created_at.astimezone(LOCAL_TZ).strftime("%d/%m")
        if k in buckets:
            buckets[k]["criticas" if r.severidad == "critica" else "advertencias"] += 1
    return [{"fecha": k, **v} for k, v in buckets.items()]


@router.get("/stats/doctor")
def stats_doctor(db: Session = Depends(get_db), user: User = Depends(require("medico"))):
    from ..models import Bed
    hs = db.scalars(select(Hospitalization).where(Hospitalization.medico_id == user.id)).unique().all()
    activas = [h for h in hs if h.activa]
    total_p = len({h.patient_id for h in hs})
    rxs = db.scalars(select(Prescription).where(Prescription.medico_id == user.id)).unique().all()
    modificadas = sum(1 for r in rxs if r.current_version > 1)
    alerts = db.scalars(select(Alert).where(Alert.medico_id == user.id)).unique().all()
    abiertas = [a for a in alerts if a.estado != "resuelta"]
    total_beds = db.scalar(select(func.count()).select_from(Bed))
    ocupadas = db.scalar(select(func.count()).select_from(Hospitalization).where(
        Hospitalization.fecha_egreso.is_(None), Hospitalization.bed_id.is_not(None)))
    fuera = db.scalar(select(func.count()).select_from(Bed).where(Bed.estado != "disponible"))
    rooms_occ = db.scalar(select(func.count(func.distinct(Bed.room_id))).select_from(Hospitalization).join(
        Bed, Hospitalization.bed_id == Bed.id).where(Hospitalization.fecha_egreso.is_(None)))
    recientes = db.scalars(select(AuditLog).where(AuditLog.user_id == user.id).order_by(AuditLog.id.desc())
                           .limit(8)).unique().all()
    pend_rev = sum(1 for a in alerts if a.estado == "pendiente_revision")
    return {
        "pacientes_total": total_p, "hospitalizados": len(activas), "habitaciones_ocupadas": rooms_occ,
        "camas_disponibles": total_beds - ocupadas - fuera,
        "prescripciones_activas": sum(1 for r in rxs if r.estado == "activa"),
        "prescripciones_modificadas": modificadas, "pendientes_revision": pend_rev,
        "alertas_abiertas": len(abiertas), "alertas_criticas_abiertas": sum(1 for a in abiertas if a.severidad == "critica"),
        "serie_alertas": _series(db, select(Alert).where(Alert.medico_id == user.id)),
        "alertas_por_tipo": [{"tipo": t, "total": n} for t, n in
                             db.execute(select(Alert.tipo, func.count()).where(Alert.medico_id == user.id)
                                        .group_by(Alert.tipo)).all()],
        "actividad": [{"accion": r.accion, "entidad": r.entidad, "fecha": r.created_at.isoformat()} for r in recientes],
    }


@router.get("/stats/nurse")
def stats_nurse(db: Session = Depends(get_db), user: User = Depends(require("enfermera"))):
    day = local_now().replace(hour=0, minute=0, second=0, microsecond=0)
    base = (select(Administration).join(Prescription, Administration.prescription_id == Prescription.id)
            .join(NurseAssignment, NurseAssignment.hospitalization_id == Prescription.hospitalization_id)
            .where(NurseAssignment.nurse_id == user.id))
    today = db.scalars(base.where(Administration.programada_para >= day,
                                  Administration.programada_para < day + timedelta(days=1))).unique().all()
    n = local_now()
    alerts = db.scalars(_scope_alerts(user)).unique().all()
    abiertas = [a for a in alerts if a.estado != "resuelta"]
    cnt = lambda st: sum(1 for t in today if t.estado == st)
    pend = [t for t in today if t.estado in BLOCKED_OR_OPEN]
    return {
        "pacientes_asignados": db.scalar(select(func.count()).select_from(NurseAssignment).join(
            Hospitalization, Hospitalization.id == NurseAssignment.hospitalization_id)
            .where(NurseAssignment.nurse_id == user.id, Hospitalization.fecha_egreso.is_(None))),
        "pendientes": len(pend), "administrados": cnt("administrado"), "no_administrados": cnt("no_administrado"),
        "proximos": sum(1 for t in pend if timedelta(0) <= t.programada_para - n <= timedelta(hours=2)),
        "alertas_activas": len(abiertas), "bloqueados": cnt("bloqueado"),
        "alertas_detectadas": len(alerts), "discrepancias_corregidas": sum(
            1 for a in alerts if a.estado == "resuelta" and a.severidad == "critica"),
        "serie_alertas": _series(db, _scope_alerts(user)),
        "estado_hoy": [{"estado": k, "total": v} for k, v in [
            ("Pendiente", cnt("pendiente") + cnt("en_preparacion") + cnt("en_verificacion")),
            ("Bloqueado", cnt("bloqueado")), ("Administrado", cnt("administrado")),
            ("No administrado", cnt("no_administrado")), ("Suspendido", cnt("suspendido"))]],
    }


# ------------------------------------------------------- historial del médico
@router.get("/history/prescriptions")
def rx_history(db: Session = Depends(get_db), user: User = Depends(require("medico"))):
    rows = db.scalars(select(PrescriptionVersion).join(Prescription, PrescriptionVersion.prescription_id == Prescription.id)
                      .where(Prescription.medico_id == user.id).order_by(PrescriptionVersion.id.desc()).limit(200)).unique()
    out = []
    for v in rows:
        rx = v.prescription
        out.append({**version_out(v), "prescription_id": rx.id, "paciente": rx.patient.nombre_completo,
                    "patient_id": rx.patient_id, "estado_prescripcion": rx.estado,
                    "vigente": v.version == rx.current_version})
    return out


@router.get("/audit")
def audit_list(db: Session = Depends(get_db), user: User = Depends(require("medico"))):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(150)).unique()
    return {"cadena": verify_audit_chain(db),
            "items": [{"id": r.id, "accion": r.accion, "entidad": r.entidad, "entidad_id": r.entidad_id,
                       "usuario": r.user.nombre_completo if r.user else None, "fecha": r.created_at.isoformat(),
                       "detalle": r.detalle} for r in rows]}
