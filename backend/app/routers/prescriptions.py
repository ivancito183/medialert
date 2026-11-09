import re
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..engine import units as U
from ..models import (Administration, Hospitalization, Medication, NurseAssignment, Patient, Prescription,
                      PrescriptionVersion, User)
from ..security import current_user, require
from ..serial import LOCAL_TZ, rx_out
from ..services import audit, ensure_access, notify_nurses_of

router = APIRouter()
VIAS = ["Oral", "Intravenosa", "Intramuscular", "Subcutánea", "Tópica", "Inhalatoria", "Sublingual", "Rectal"]
MAX_DAYS = 30
OPEN = ["pendiente", "en_preparacion", "en_verificacion", "bloqueado"]


class RxIn(BaseModel):
    medication_id: int
    presentacion: str = Field(min_length=1, max_length=80)
    concentracion: str | None = Field(None, max_length=80)
    dosis: Decimal
    unidad: str
    via: str
    frecuencia: str = Field(min_length=2, max_length=60)
    horarios: list[str] = Field(min_length=1, max_length=12)
    fecha_inicio: date
    fecha_fin: date
    observaciones: str | None = None

    @field_validator("dosis")
    @classmethod
    def d(cls, v):
        try:
            return U.to_decimal(v)
        except U.InvalidDose as e:
            raise ValueError(str(e))

    @field_validator("unidad")
    @classmethod
    def u(cls, v):
        try:
            return U.canon_unit(v)
        except U.InvalidDose as e:
            raise ValueError(str(e))

    @field_validator("via")
    @classmethod
    def via_ok(cls, v):
        if v not in VIAS:
            raise ValueError("Vía de administración no válida")
        return v

    @field_validator("horarios")
    @classmethod
    def h(cls, v):
        for x in v:
            if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", x):
                raise ValueError(f"Horario inválido: {x} (use HH:MM)")
        if len(set(v)) != len(v):
            raise ValueError("Hay horarios repetidos")
        return sorted(v)

    @model_validator(mode="after")
    def dates(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha de finalización no puede ser anterior a la de inicio")
        if (self.fecha_fin - self.fecha_inicio).days >= MAX_DAYS:
            raise ValueError(f"La duración máxima por prescripción es de {MAX_DAYS} días")
        return self


class NewRx(RxIn):
    patient_id: int


class ModifyRx(RxIn):
    motivo_cambio: str = Field(min_length=5)


class SuspendIn(BaseModel):
    motivo: str = Field(min_length=5)


def _check_med(db: Session, data: RxIn) -> Medication:
    m = db.get(Medication, data.medication_id)
    if not m:
        raise HTTPException(422, "Medicamento no encontrado en el catálogo")
    if m.unidades_permitidas and data.unidad not in m.unidades_permitidas:
        raise HTTPException(422, f"La unidad {data.unidad} no es apropiada para {m.nombre} "
                                 f"(permitidas: {', '.join(m.unidades_permitidas)})")
    return m


def sync_administrations(db: Session, rx: Prescription, v: PrescriptionVersion):
    """Genera los eventos de medicación; descarta los pendientes sin trabajo previo que ya no aplican."""
    wanted = set()
    d = v.fecha_inicio
    while d <= v.fecha_fin:
        for hhmm in v.horarios:
            h, m = map(int, hhmm.split(":"))
            wanted.add(datetime(d.year, d.month, d.day, h, m, tzinfo=LOCAL_TZ))
        d += timedelta(days=1)
    existing = {a.programada_para.astimezone(LOCAL_TZ): a for a in
                db.scalars(select(Administration).where(Administration.prescription_id == rx.id))}
    for when, a in existing.items():
        if when not in wanted and a.estado == "pendiente":
            db.delete(a)
    for when in wanted - set(existing):
        db.add(Administration(prescription_id=rx.id, patient_id=rx.patient_id, programada_para=when))


def _own_rx(db: Session, user: User, rid: int) -> Prescription:
    rx = db.get(Prescription, rid)
    if not rx:
        raise HTTPException(404, "Prescripción no encontrada")
    ensure_access(db, user, rx.hospitalization)
    return rx


@router.get("/medications")
def medications(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [{"id": m.id, "nombre": m.nombre, "principio_activo": m.principio_activo,
             "presentacion": m.presentacion, "concentracion": m.concentracion,
             "unidades": m.unidades_permitidas, "indicaciones": m.indicaciones,
             "contraindicaciones": m.contraindicaciones, "efectos_adversos": m.efectos_adversos, "fuente": m.fuente} for m in db.scalars(select(Medication).order_by(Medication.nombre))]


@router.get("/prescriptions")
def list_rx(estado: str = "", patient_id: int | None = None, db: Session = Depends(get_db),
            user: User = Depends(current_user)):
    q = select(Prescription).join(Hospitalization, Prescription.hospitalization_id == Hospitalization.id)
    if user.rol == "medico":
        q = q.where(Hospitalization.medico_id == user.id)
    else:
        q = q.join(NurseAssignment, NurseAssignment.hospitalization_id == Hospitalization.id) \
            .where(NurseAssignment.nurse_id == user.id)
    if estado:
        q = q.where(Prescription.estado == estado)
    if patient_id:
        q = q.where(Prescription.patient_id == patient_id)
    return [rx_out(r) for r in db.scalars(q.order_by(Prescription.id.desc())).unique()]


@router.get("/prescriptions/{rid}")
def get_rx(rid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return rx_out(_own_rx(db, user, rid), versions=True)


@router.post("/prescriptions", status_code=201)
def create_rx(data: NewRx, request: Request, db: Session = Depends(get_db), user: User = Depends(require("medico"))):
    h = db.scalars(select(Hospitalization).where(Hospitalization.patient_id == data.patient_id,
                                                 Hospitalization.fecha_egreso.is_(None))).first()
    if not h:
        raise HTTPException(404, "El paciente no tiene una hospitalización activa")
    ensure_access(db, user, h)
    med = _check_med(db, data)
    rx = Prescription(hospitalization_id=h.id, patient_id=h.patient_id, medico_id=user.id)
    db.add(rx)
    db.flush()
    v = PrescriptionVersion(prescription_id=rx.id, version=1, created_by=user.id, medication_id=med.id,
                            **data.model_dump(exclude={"patient_id", "medication_id"}))
    db.add(v)
    db.flush()
    db.refresh(rx)
    sync_administrations(db, rx, v)
    notify_nurses_of(db, h.id, "nueva_prescripcion", "Nueva prescripción",
                     f"{med.nombre} {U.fmt(data.dosis, data.unidad)} para {h.patient.nombre_completo}.",
                     "/enfermeria")
    audit(db, user, "crear", "prescription", rx.id, {"version": 1, "medicamento": med.nombre,
                                                    "dosis": U.fmt(data.dosis, data.unidad)},
          request.client.host if request.client else None)
    db.commit()
    return {"id": rx.id}


@router.post("/prescriptions/{rid}/versions", status_code=201)
def modify_rx(rid: int, data: ModifyRx, request: Request, db: Session = Depends(get_db),
              user: User = Depends(require("medico"))):
    rx = _own_rx(db, user, rid)
    if rx.estado == "suspendida":
        raise HTTPException(409, "No se puede modificar una prescripción suspendida; cree una nueva")
    med = _check_med(db, data)
    old = rx.vigente
    ver = rx.current_version + 1
    v = PrescriptionVersion(prescription_id=rx.id, version=ver, created_by=user.id, medication_id=med.id,
                            **data.model_dump(exclude={"medication_id"}))
    db.add(v)
    rx.current_version = ver
    db.flush()
    db.refresh(rx)
    sync_administrations(db, rx, v)
    cambios = []
    if old.dosis != v.dosis or old.unidad != v.unidad:
        cambios.append(f"dosis {U.fmt(old.dosis, old.unidad)} → {U.fmt(v.dosis, v.unidad)}")
    if old.horarios != v.horarios:
        cambios.append(f"horario {', '.join(old.horarios)} → {', '.join(v.horarios)}")
    if old.via != v.via:
        cambios.append(f"vía {old.via} → {v.via}")
    if old.medication_id != v.medication_id:
        cambios.append(f"medicamento {old.medication.nombre} → {med.nombre}")
    resumen = "; ".join(cambios) or "otros datos"
    notify_nurses_of(db, rx.hospitalization_id, "prescripcion_modificada", "Prescripción modificada",
                     f"{rx.patient.nombre_completo}: {resumen} (v{ver}). Actualice sus registros abiertos.",
                     "/enfermeria", "warning")
    audit(db, user, "modificar", "prescription", rx.id, {"version": ver, "cambios": resumen,
                                                        "motivo": data.motivo_cambio},
          request.client.host if request.client else None)
    db.commit()
    return {"id": rx.id, "version": ver}


@router.post("/prescriptions/{rid}/suspend")
def suspend_rx(rid: int, data: SuspendIn, request: Request, db: Session = Depends(get_db),
               user: User = Depends(require("medico"))):
    rx = _own_rx(db, user, rid)
    if rx.estado == "suspendida":
        raise HTTPException(409, "La prescripción ya está suspendida")
    rx.estado, rx.motivo_suspension = "suspendida", data.motivo
    for a in db.scalars(select(Administration).where(Administration.prescription_id == rid,
                                                     Administration.estado.in_(OPEN))):
        a.estado = "suspendido"
    notify_nurses_of(db, rx.hospitalization_id, "prescripcion_suspendida", "Medicamento suspendido",
                     f"{rx.vigente.medication.nombre} de {rx.patient.nombre_completo} fue SUSPENDIDO.",
                     "/enfermeria", "critical")
    audit(db, user, "suspender", "prescription", rid, {"motivo": data.motivo},
          request.client.host if request.client else None)
    db.commit()
    return {"ok": True}
