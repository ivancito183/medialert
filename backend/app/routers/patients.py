from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (Administration, Alert, AuditLog, Bed, Hospitalization, NurseAssignment, Patient, Prescription,
                      Room, User, now)
from ..security import current_user, require
from ..serial import (adm_out, alert_out, bed_out, clinical_out, hosp_out, num, patient_out, rx_out)
from ..services import audit, ensure_access, notify

router = APIRouter()

DOC_TYPES = ["CC", "TI", "CE", "PA", "RC", "OTRO"]
ESTADOS_HOSP = ["hospitalizado", "estable", "critico"]


class PatientIn(BaseModel):
    nombres: str = Field(min_length=2, max_length=100)
    apellidos: str = Field(min_length=2, max_length=100)
    tipo_documento: Literal["CC", "TI", "CE", "PA", "RC", "OTRO"]
    documento: str = Field(min_length=4, max_length=20)
    fecha_nacimiento: date
    sexo: Literal["Femenino", "Masculino", "Otro"]
    telefono: str | None = Field(None, max_length=30)
    peso_kg: Decimal | None = Field(None, gt=0, le=500)
    estatura_cm: Decimal | None = Field(None, gt=0, le=260)
    alergias: str | None = None
    antecedentes: str | None = None
    observaciones: str | None = None
    # hospitalización
    bed_id: int | None = None
    fecha_ingreso: date
    motivo: str = Field(min_length=3)
    diagnostico: str = Field(min_length=3, max_length=300)
    descripcion: str | None = None
    estado: Literal["hospitalizado", "estable", "critico"] = "hospitalizado"
    enfermera_id: int | None = None

    @field_validator("documento")
    @classmethod
    def doc(cls, v, info):
        v = v.strip()
        if not v.replace("-", "").isalnum():
            raise ValueError("El documento solo admite letras, números y guion")
        return v

    @field_validator("fecha_nacimiento")
    @classmethod
    def nac(cls, v):
        if v > date.today():
            raise ValueError("La fecha de nacimiento no puede ser futura")
        return v

    @field_validator("nombres", "apellidos")
    @classmethod
    def strip(cls, v):
        return v.strip()


class PatientPatch(BaseModel):
    telefono: str | None = None
    peso_kg: Decimal | None = Field(None, gt=0, le=500)
    estatura_cm: Decimal | None = Field(None, gt=0, le=260)
    alergias: str | None = None
    antecedentes: str | None = None
    observaciones: str | None = None
    diagnostico: str | None = Field(None, min_length=3, max_length=300)
    motivo: str | None = None
    descripcion: str | None = None
    estado: Literal["hospitalizado", "estable", "critico"] | None = None
    enfermera_id: int | None = None


def _active_hosp_query(user: User):
    q = select(Hospitalization).where(Hospitalization.fecha_egreso.is_(None))
    if user.rol == "medico":
        return q.where(Hospitalization.medico_id == user.id)
    return q.join(NurseAssignment, NurseAssignment.hospitalization_id == Hospitalization.id) \
        .where(NurseAssignment.nurse_id == user.id)


def _assign_bed(db: Session, bed_id: int) -> Bed:
    bed = db.get(Bed, bed_id)
    if not bed:
        raise HTTPException(404, "Cama no encontrada")
    if bed.estado != "disponible":
        raise HTTPException(409, f"La cama {bed.room.numero}-{bed.etiqueta} no está disponible ({bed.estado})")
    if db.scalar(select(Hospitalization.id).where(Hospitalization.bed_id == bed_id,
                                                  Hospitalization.fecha_egreso.is_(None))):
        raise HTTPException(409, f"La cama {bed.room.numero}-{bed.etiqueta} ya está ocupada")
    return bed


def _set_nurse(db: Session, hosp: Hospitalization, nurse_id: int | None):
    if nurse_id is None:
        return
    n = db.get(User, nurse_id)
    if not n or n.rol != "enfermera" or not n.activo:
        raise HTTPException(422, "La enfermera indicada no existe o no está activa")
    for a in db.scalars(select(NurseAssignment).where(NurseAssignment.hospitalization_id == hosp.id)):
        if a.nurse_id != nurse_id:
            db.delete(a)
    if not db.scalar(select(NurseAssignment.id).where(NurseAssignment.hospitalization_id == hosp.id,
                                                      NurseAssignment.nurse_id == nurse_id)):
        db.add(NurseAssignment(nurse_id=nurse_id, hospitalization_id=hosp.id))
        notify(db, nurse_id, "paciente_asignado", "Nuevo paciente asignado",
               f"Se le asignó a {hosp.patient.nombre_completo}.", f"/pacientes/{hosp.patient_id}")


@router.get("/patients")
def list_patients(q: str = "", habitacion: str = "", cama: str = "", estado: str = "",
                  db: Session = Depends(get_db), user: User = Depends(current_user)):
    qry = _active_hosp_query(user).join(Hospitalization.patient)
    if q.strip():
        t = f"%{q.strip()}%"
        qry = qry.where(or_(Patient.nombres.ilike(t), Patient.apellidos.ilike(t), Patient.documento.ilike(t),
                            (Patient.nombres + " " + Patient.apellidos).ilike(t)))
    if estado:
        qry = qry.where(Hospitalization.estado == estado)
    if habitacion or cama:
        qry = qry.join(Bed, Hospitalization.bed_id == Bed.id).join(Room, Bed.room_id == Room.id)
        if habitacion:
            qry = qry.where(Room.numero == habitacion)
        if cama:
            qry = qry.where(Bed.etiqueta == cama.upper())
    rows = db.scalars(qry.order_by(Patient.apellidos)).unique().all()
    return [hosp_out(h) for h in rows]


@router.post("/patients", status_code=201)
def create_patient(data: PatientIn, request: Request, db: Session = Depends(get_db),
                   user: User = Depends(require("medico"))):
    if db.scalar(select(Patient.id).where(Patient.tipo_documento == data.tipo_documento,
                                          Patient.documento == data.documento)):
        raise HTTPException(409, f"Ya existe un paciente con {data.tipo_documento} {data.documento}")
    bed = _assign_bed(db, data.bed_id) if data.bed_id else None
    p = Patient(**data.model_dump(include={"nombres", "apellidos", "tipo_documento", "documento", "fecha_nacimiento",
                                           "sexo", "telefono", "peso_kg", "estatura_cm", "alergias", "antecedentes",
                                           "observaciones"}))
    db.add(p)
    db.flush()
    h = Hospitalization(patient_id=p.id, bed_id=bed.id if bed else None, medico_id=user.id,
                        fecha_ingreso=data.fecha_ingreso, motivo=data.motivo, diagnostico=data.diagnostico,
                        descripcion=data.descripcion, estado=data.estado)
    db.add(h)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "La cama fue ocupada por otro paciente. Elija otra.")
    db.refresh(h)
    _set_nurse(db, h, data.enfermera_id)
    audit(db, user, "crear", "patient", p.id, {"hospitalizacion": h.id, "cama": bed_out(bed) if bed else None},
          request.client.host if request.client else None)
    db.commit()
    return {"id": p.id, "hospitalization_id": h.id}


def _get_hosp(db: Session, user: User, patient_id: int) -> Hospitalization:
    h = db.scalars(select(Hospitalization).where(Hospitalization.patient_id == patient_id)
                   .order_by(Hospitalization.id.desc())).first()
    if not h:
        raise HTTPException(404, "Paciente no encontrado")
    ensure_access(db, user, h)
    return h


@router.get("/patients/{pid}")
def get_patient(pid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    h = _get_hosp(db, user, pid)
    p = h.patient
    rxs = db.scalars(select(Prescription).where(Prescription.hospitalization_id == h.id)
                     .order_by(Prescription.id.desc())).unique().all()
    adms = db.scalars(select(Administration).where(Administration.patient_id == pid)
                      .order_by(Administration.programada_para)).unique().all()
    alerts = db.scalars(select(Alert).where(Alert.patient_id == pid).order_by(Alert.id.desc())).unique().all()
    hist = db.scalars(select(AuditLog).where(AuditLog.entidad == "patient", AuditLog.entidad_id == pid)
                      .order_by(AuditLog.id.desc())).unique().all()
    nurse = db.scalar(select(User).join(NurseAssignment, NurseAssignment.nurse_id == User.id)
                      .where(NurseAssignment.hospitalization_id == h.id))
    return {
        **hosp_out(h, full_doc=True), "datos": clinical_out(p), "motivo": h.motivo, "descripcion": h.descripcion,
        "enfermera": {"id": nurse.id, "nombre": nurse.nombre_completo} if nurse else None,
        "prescripciones": [rx_out(r) for r in rxs],
        "pendientes": [adm_out(a) for a in adms if a.estado in
                       ("pendiente", "en_preparacion", "en_verificacion", "bloqueado")],
        "administrados": [adm_out(a) for a in adms if a.estado in ("administrado", "no_administrado")],
        "alertas": [alert_out(a) for a in alerts],
        "historial": [{"id": x.id, "accion": x.accion, "detalle": x.detalle, "fecha": x.created_at.isoformat(),
                       "usuario": x.user.nombre_completo if x.user else None} for x in hist],
    }


@router.patch("/patients/{pid}")
def patch_patient(pid: int, data: PatientPatch, request: Request, db: Session = Depends(get_db),
                  user: User = Depends(require("medico"))):
    h = _get_hosp(db, user, pid)
    p = h.patient
    changes = {}
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == "enfermera_id":
            _set_nurse(db, h, v)
            changes[k] = v
            continue
        target = h if k in ("diagnostico", "motivo", "descripcion", "estado") else p
        old = getattr(target, k)
        if old != v:
            changes[k] = {"antes": str(old) if old is not None else None, "despues": str(v) if v is not None else None}
            setattr(target, k, v)
    if "alergias" in changes:  # el cambio de alergias interesa a enfermería
        for a in db.scalars(select(NurseAssignment).where(NurseAssignment.hospitalization_id == h.id)):
            notify(db, a.nurse_id, "alergias", "Alergias actualizadas",
                   f"Se actualizaron las alergias de {p.nombre_completo}.", f"/pacientes/{p.id}", "warning")
    audit(db, user, "modificar", "patient", pid, changes, request.client.host if request.client else None)
    db.commit()
    return {"ok": True, "cambios": list(changes)}


class BedIn(BaseModel):
    bed_id: int


@router.put("/patients/{pid}/bed")
def move_bed(pid: int, data: BedIn, request: Request, db: Session = Depends(get_db),
             user: User = Depends(require("medico"))):
    h = _get_hosp(db, user, pid)
    if not h.activa:
        raise HTTPException(409, "El paciente ya fue egresado")
    bed = _assign_bed(db, data.bed_id)
    old = bed_out(h.bed)
    h.bed_id = bed.id
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "La cama fue ocupada por otro paciente")
    audit(db, user, "cambiar_cama", "patient", pid, {"antes": old, "despues": bed_out(bed)},
          request.client.host if request.client else None)
    for a in db.scalars(select(NurseAssignment).where(NurseAssignment.hospitalization_id == h.id)):
        notify(db, a.nurse_id, "cambio_cama", "Cambio de cama",
               f"{h.patient.nombre_completo} fue trasladado a {bed.room.numero}-{bed.etiqueta}.",
               f"/pacientes/{pid}")
    db.commit()
    return {"ok": True}


@router.post("/patients/{pid}/discharge")
def discharge(pid: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require("medico"))):
    h = _get_hosp(db, user, pid)
    if not h.activa:
        raise HTTPException(409, "El paciente ya fue egresado")
    h.fecha_egreso = now()
    h.estado = "egresado"
    for rx in db.scalars(select(Prescription).where(Prescription.hospitalization_id == h.id,
                                                    Prescription.estado == "activa")):
        rx.estado = "suspendida"
        rx.motivo_suspension = "Egreso del paciente"
        for a in db.scalars(select(Administration).where(Administration.prescription_id == rx.id,
                                                         Administration.estado.in_(
                                                             ["pendiente", "en_preparacion", "en_verificacion",
                                                              "bloqueado"]))):
            a.estado = "suspendido"
    audit(db, user, "egreso", "patient", pid, None, request.client.host if request.client else None)
    db.commit()
    return {"ok": True}
