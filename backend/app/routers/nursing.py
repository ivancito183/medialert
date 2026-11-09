"""Flujo de enfermería: tareas, preparación, validación en servidor y confirmación de administración."""
import re
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..engine import units as U
from ..engine.rules import (ADVERTENCIA, CRITICA, Finding, Prescribed, Registered, RuleConfig, allergy_matches,
                            validate)
from ..models import (Administration, Alert, Bed, Hospitalization, Medication, NurseAssignment, Patient,
                      Prescription, PreparationRecord, Room, User, now)
from ..security import require
from ..serial import LOCAL_TZ, adm_out, alert_out, clinical_out, local_now, patient_out, prep_out, version_out, bed_out
from ..services import audit, notify, raise_alert

router = APIRouter(prefix="/nursing")
nurse_only = require("enfermera")
CFG = RuleConfig(Decimal(str(settings.dose_tolerance_pct)), settings.schedule_window_minutes)
TERMINAL = ("administrado", "no_administrado")
AUTO_RESOLVABLE = {"dosis", "unidad", "medicamento", "via", "paciente", "prescripcion_modificada", "horario",
                   "concentracion", "alergia", "preparacion_bloqueada"}


class _DoseIn(BaseModel):
    unidad: str
    via: str = Field(min_length=2, max_length=30)
    documento_verificado: str = Field(min_length=1, max_length=30)
    observaciones: str | None = None

    @field_validator("unidad")
    @classmethod
    def u(cls, v):
        try:
            return U.canon_unit(v)
        except U.InvalidDose as e:
            raise ValueError(str(e))


def _dose(v):
    try:
        return U.to_decimal(v)
    except U.InvalidDose as e:
        raise ValueError(str(e))


class PrepareIn(_DoseIn):
    medication_id: int
    dosis: Decimal
    presentacion: str | None = None
    concentracion: str | None = None
    hora_prevista: str | None = None
    version_visualizada: int = Field(ge=1)

    @field_validator("dosis")
    @classmethod
    def _d(cls, v):
        return _dose(v)

    @field_validator("hora_prevista")
    @classmethod
    def hp(cls, v):
        if v and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
            raise ValueError("Hora prevista inválida (HH:MM)")
        return v or None


class ConfirmIn(_DoseIn):
    preparation_id: int
    dosis_administrada: Decimal
    reconoce_advertencias: bool = False

    @field_validator("dosis_administrada")
    @classmethod
    def _d(cls, v):
        return _dose(v)


class NotGivenIn(BaseModel):
    motivo: str = Field(min_length=3)


def _load(db: Session, user: User, aid: int) -> Administration:
    a = db.scalars(select(Administration).where(Administration.id == aid).with_for_update(of=Administration)).first()
    if not a:
        raise HTTPException(404, "Evento de medicación no encontrado")
    if not db.scalar(select(NurseAssignment.id).where(NurseAssignment.nurse_id == user.id,
                                                      NurseAssignment.hospitalization_id ==
                                                      a.prescription.hospitalization_id)):
        raise HTTPException(403, "Este paciente no está asignado a usted")
    return a


def _prescribed(a: Administration) -> Prescribed:
    rx = a.prescription
    v = rx.vigente
    return Prescribed(medication_id=v.medication_id, medication_name=v.medication.nombre, dose=v.dosis,
                      unit=v.unidad, route=v.via, version=rx.current_version, status=rx.estado,
                      concentration=v.concentracion, scheduled_at=a.programada_para)


def _persist_alerts(db: Session, a: Administration, findings: list[Finding], user: User, prep=None, ver=None):
    """Registra cada hallazgo (deduplicando reintentos idénticos abiertos) y avisa al médico si es crítico."""
    rx = a.prescription
    ids = []
    for f in findings:
        dup = db.scalars(select(Alert).where(
            Alert.administration_id == a.id, Alert.tipo == f.tipo, Alert.estado != "resuelta",
            Alert.dosis_registrada == f.detalle.get("dosis_registrada"), Alert.nurse_id == user.id)).first()
        if dup:
            ids.append(dup.id)
            continue
        al = raise_alert(db, finding=f, patient_id=a.patient_id, prescription=rx, version=ver or rx.vigente,
                         administration=a, preparation=prep, nurse_id=user.id, medico_id=rx.medico_id,
                         medicamento=rx.vigente.medication.nombre)
        ids.append(al.id)
        audit(db, user, "alerta", "alert", al.id, {"tipo": f.tipo, "severidad": f.severidad})
        if f.bloquea:
            notify(db, rx.medico_id, "discrepancia", "Discrepancia detectada",
                   f"{a.patient.nombre_completo}: {f.mensaje}", "/alertas", "critical")
    return ids


def _blocked(db: Session, a: Administration, findings: list[Finding], ids: list[int], extra: dict | None = None):
    return JSONResponse(status_code=409, content={
        "bloqueado": True, "administracion": adm_out(a),
        "hallazgos": [{"tipo": f.tipo, "severidad": f.severidad, "mensaje": f.mensaje, "detalle": f.detalle}
                      for f in findings], "alertas": ids, **(extra or {})})


def _duplicate(a: Administration) -> Finding:
    when = a.administrada_en.astimezone(LOCAL_TZ).strftime("%d/%m %H:%M") if a.administrada_en else "antes"
    return Finding("administracion_duplicada", CRITICA,
                   f"Este evento de medicación ya fue registrado ({a.estado.replace('_', ' ')}) el {when}. "
                   "No se puede registrar de nuevo: solicite revisión médica.", {})


def _allergies(a: Administration, med: Medication) -> list[str]:
    return allergy_matches(a.patient.alergias, med.principio_activo, med.clase_alergia)


# ------------------------------------------------------------------ consultas
@router.get("/tasks")
def tasks(fecha: str = "", estado: str = "", q: str = "", habitacion: str = "", cama: str = "",
          db: Session = Depends(get_db), user: User = Depends(nurse_only)):
    day = datetime.strptime(fecha, "%Y-%m-%d").date() if fecha else local_now().date()
    start = datetime(day.year, day.month, day.day, tzinfo=LOCAL_TZ)
    qry = (select(Administration).join(Prescription, Administration.prescription_id == Prescription.id)
           .join(Hospitalization, Prescription.hospitalization_id == Hospitalization.id)
           .join(NurseAssignment, NurseAssignment.hospitalization_id == Hospitalization.id)
           .join(Patient, Administration.patient_id == Patient.id)
           .where(NurseAssignment.nurse_id == user.id, Hospitalization.fecha_egreso.is_(None),
                  Administration.programada_para >= start, Administration.programada_para < start + timedelta(days=1)))
    if estado:
        qry = qry.where(Administration.estado == estado)
    if q.strip():
        t = f"%{q.strip()}%"
        qry = qry.where(or_(Patient.nombres.ilike(t), Patient.apellidos.ilike(t), Patient.documento.ilike(t),
                            (Patient.nombres + " " + Patient.apellidos).ilike(t)))
    if habitacion or cama:
        qry = qry.join(Bed, Hospitalization.bed_id == Bed.id).join(Room, Bed.room_id == Room.id)
        if habitacion:
            qry = qry.where(Room.numero == habitacion)
        if cama:
            qry = qry.where(Bed.etiqueta == cama.upper())
    rows = db.scalars(qry.order_by(Administration.programada_para)).unique().all()
    counts = dict(db.execute(select(Alert.administration_id, func.count()).where(
        Alert.administration_id.in_([r.id for r in rows] or [0]), Alert.estado != "resuelta")
        .group_by(Alert.administration_id)).all())
    return [adm_out(r, counts.get(r.id, 0)) for r in rows]


@router.get("/administrations/{aid}")
def detail(aid: int, db: Session = Depends(get_db), user: User = Depends(nurse_only)):
    a = _load(db, user, aid)
    rx, p = a.prescription, a.patient
    v = rx.vigente
    preps = db.scalars(select(PreparationRecord).where(PreparationRecord.administration_id == aid)
                       .order_by(PreparationRecord.id.desc())).unique().all()
    alerts = db.scalars(select(Alert).where(Alert.administration_id == aid).order_by(Alert.id.desc())).unique().all()
    return {**adm_out(a, sum(1 for x in alerts if x.estado != "resuelta")),
            "paciente": patient_out(p, full_doc=True), "datos": clinical_out(p), "prescripcion": version_out(v),
            "version_actual": rx.current_version, "rx_estado": rx.estado, "motivo_suspension": rx.motivo_suspension,
            "habitacion_cama": bed_out(rx.hospitalization.bed),
            "alergias_coinciden": _allergies(a, v.medication),
            "preparaciones": [prep_out(x) for x in preps], "alertas": [alert_out(x) for x in alerts]}


# ----------------------------------------------------------------- preparación
@router.post("/administrations/{aid}/prepare")
def prepare(aid: int, data: PrepareIn, request: Request, db: Session = Depends(get_db),
            user: User = Depends(nurse_only)):
    a = _load(db, user, aid)
    rx = a.prescription
    ip = request.client.host if request.client else None
    findings: list[Finding] = []

    if a.estado in TERMINAL:
        findings.append(_duplicate(a))
        ids = _persist_alerts(db, a, findings, user)
        audit(db, user, "intento_duplicado", "administration", a.id, None, ip)
        db.commit()
        return _blocked(db, a, findings, ids)

    if data.version_visualizada > rx.current_version:
        raise HTTPException(422, "Versión de prescripción inexistente")
    ver = next(v for v in rx.versions if v.version == data.version_visualizada)
    if db.get(Medication, data.medication_id) is None:
        raise HTTPException(422, "Medicamento no encontrado")

    reg = Registered(medication_id=data.medication_id, dose=data.dosis, unit=data.unidad, route=data.via,
                     patient_document=data.documento_verificado, version=data.version_visualizada,
                     concentration=data.concentracion, at=local_now())
    med = db.get(Medication, data.medication_id)
    findings += validate(_prescribed(a), reg, a.patient.documento, _allergies(a, med), CFG)
    blocking = any(f.bloquea for f in findings)

    prep = PreparationRecord(administration_id=a.id, prescription_version_id=ver.id, nurse_id=user.id,
                             medication_id=data.medication_id, dosis=data.dosis, unidad=data.unidad,
                             presentacion=data.presentacion, concentracion=data.concentracion, via=data.via,
                             hora_prevista=data.hora_prevista, documento_verificado=data.documento_verificado,
                             observaciones=data.observaciones, estado="bloqueada" if blocking else "verificada")
    db.add(prep)
    db.flush()
    ids = _persist_alerts(db, a, findings, user, prep, ver)
    if a.estado != "suspendido":
        a.estado = "bloqueado" if blocking else "en_verificacion"
    if not blocking:  # corrección válida: se cierran las discrepancias corregibles de este evento
        for old in db.scalars(select(Alert).where(Alert.administration_id == a.id, Alert.estado != "resuelta",
                                                  Alert.id.not_in(ids or [0]))):
            if old.tipo in AUTO_RESOLVABLE:
                old.estado, old.resuelta_en, old.resuelta_por = "resuelta", now(), user.id
                old.resolucion = "Corregido por enfermería: nuevo registro de preparación sin discrepancias críticas"
                audit(db, user, "resolver_auto", "alert", old.id, {"preparacion": prep.id})
    audit(db, user, "preparar", "preparation", prep.id,
          {"administracion": a.id, "estado": prep.estado, "hallazgos": [f.tipo for f in findings]}, ip)
    db.commit()
    body = {"preparacion": prep_out(prep), "administracion": adm_out(a), "alertas": ids,
            "hallazgos": [{"tipo": f.tipo, "severidad": f.severidad, "mensaje": f.mensaje, "detalle": f.detalle}
                          for f in findings]}
    if blocking:
        return JSONResponse(status_code=409, content={"bloqueado": True, **body})
    return {"bloqueado": False, **body}


# ----------------------------------------------------------------- confirmación
@router.post("/administrations/{aid}/confirm")
def confirm(aid: int, data: ConfirmIn, request: Request, db: Session = Depends(get_db),
            user: User = Depends(nurse_only)):
    a = _load(db, user, aid)
    rx = a.prescription
    ip = request.client.host if request.client else None
    if a.estado in TERMINAL:
        f = [_duplicate(a)]
        ids = _persist_alerts(db, a, f, user)
        audit(db, user, "intento_duplicado", "administration", a.id, None, ip)
        db.commit()
        return _blocked(db, a, f, ids)

    prep = db.get(PreparationRecord, data.preparation_id)
    if not prep or prep.administration_id != a.id:
        raise HTTPException(404, "Registro de preparación no encontrado para este evento")

    findings: list[Finding] = []
    med = db.get(Medication, prep.medication_id)
    reg = Registered(medication_id=prep.medication_id, dose=data.dosis_administrada, unit=data.unidad,
                     route=data.via, patient_document=data.documento_verificado, version=prep.version.version,
                     concentration=prep.concentracion, at=local_now())
    findings += validate(_prescribed(a), reg, a.patient.documento, _allergies(a, med), CFG)
    if prep.estado != "verificada":
        findings.append(Finding("preparacion_bloqueada", CRITICA,
                                "La preparación asociada está bloqueada por discrepancias: corrija el registro."))
    pend = db.scalars(select(Alert).where(Alert.administration_id == a.id, Alert.estado != "resuelta",
                                          Alert.severidad == CRITICA)).all()
    if pend and not any(f.bloquea for f in findings):
        findings.append(Finding("alerta_abierta", CRITICA,
                                f"Existen {len(pend)} alerta(s) crítica(s) sin resolver para este evento "
                                "(p. ej. revisión médica pendiente)."))

    if any(f.bloquea for f in findings):
        ids = _persist_alerts(db, a, [f for f in findings if f.tipo != "alerta_abierta"], user, prep)
        if a.estado != "suspendido":
            a.estado = "bloqueado"
        audit(db, user, "confirmacion_bloqueada", "administration", a.id, {"hallazgos": [f.tipo for f in findings]}, ip)
        db.commit()
        return _blocked(db, a, findings, ids)

    warns = [f for f in findings if f.severidad == ADVERTENCIA]
    if warns and not data.reconoce_advertencias:
        return JSONResponse(status_code=409, content={
            "bloqueado": False, "requiere_reconocer": True, "administracion": adm_out(a),
            "hallazgos": [{"tipo": f.tipo, "severidad": f.severidad, "mensaje": f.mensaje, "detalle": f.detalle}
                          for f in warns]})
    for f in warns:  # advertencias reconocidas: quedan trazadas como resueltas
        al = raise_alert(db, finding=f, patient_id=a.patient_id, prescription=rx, version=prep.version,
                         administration=a, preparation=prep, nurse_id=user.id, medico_id=rx.medico_id,
                         medicamento=med.nombre)
        al.estado, al.resuelta_en, al.resuelta_por = "resuelta", now(), user.id
        al.resolucion = "Advertencia verificada y reconocida por enfermería al confirmar"
    for old in db.scalars(select(Alert).where(Alert.administration_id == a.id, Alert.estado != "resuelta")):
        old.estado, old.resuelta_en, old.resuelta_por = "resuelta", now(), user.id
        old.resolucion = old.resolucion or "Advertencia verificada al confirmar la administración"

    a.estado, a.nurse_id, a.administrada_en = "administrado", user.id, now()
    a.dosis_administrada, a.unidad_administrada = data.dosis_administrada, data.unidad
    a.via_administrada, a.version_administrada = data.via, prep.version.version
    a.observaciones = data.observaciones
    audit(db, user, "administrar", "administration", a.id,
          {"dosis": U.fmt(data.dosis_administrada, data.unidad), "version": prep.version.version}, ip)
    db.commit()
    return {"bloqueado": False, "administracion": adm_out(a)}


@router.post("/administrations/{aid}/not-given")
def not_given(aid: int, data: NotGivenIn, request: Request, db: Session = Depends(get_db),
              user: User = Depends(nurse_only)):
    a = _load(db, user, aid)
    if a.estado in TERMINAL or a.estado == "suspendido":
        raise HTTPException(409, "Este evento ya tiene un estado final")
    a.estado, a.nurse_id, a.observaciones, a.administrada_en = "no_administrado", user.id, data.motivo, now()
    audit(db, user, "no_administrar", "administration", a.id, {"motivo": data.motivo},
          request.client.host if request.client else None)
    notify(db, a.prescription.medico_id, "no_administrado", "Medicamento no administrado",
           f"{a.patient.nombre_completo}: {a.prescription.vigente.medication.nombre} — {data.motivo}",
           "/historial", "warning")
    db.commit()
    return {"ok": True}


@router.get("/history")
def history(estado: str = "", q: str = "", db: Session = Depends(get_db), user: User = Depends(nurse_only)):
    qry = (select(Administration).join(Prescription, Administration.prescription_id == Prescription.id)
           .join(NurseAssignment, NurseAssignment.hospitalization_id == Prescription.hospitalization_id)
           .join(Patient, Administration.patient_id == Patient.id)
           .where(NurseAssignment.nurse_id == user.id,
                  Administration.estado.in_(["administrado", "no_administrado", "suspendido", "bloqueado"])))
    if estado:
        qry = qry.where(Administration.estado == estado)
    if q.strip():
        t = f"%{q.strip()}%"
        qry = qry.where(or_(Patient.nombres.ilike(t), Patient.apellidos.ilike(t), Patient.documento.ilike(t)))
    rows = db.scalars(qry.order_by(Administration.programada_para.desc()).limit(300)).unique().all()
    counts = dict(db.execute(select(Alert.administration_id, func.count()).where(
        Alert.administration_id.in_([r.id for r in rows] or [0])).group_by(Alert.administration_id)).all())
    return [{**adm_out(r), "alertas_relacionadas": counts.get(r.id, 0)} for r in rows]
