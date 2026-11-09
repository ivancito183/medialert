from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Bed, Hospitalization, Room, User
from ..security import current_user, require
from ..services import audit, can_access_hospitalization, mask_doc

router = APIRouter()


@router.get("/rooms")
def rooms(db: Session = Depends(get_db), user: User = Depends(current_user)):
    occ = {h.bed_id: h for h in db.scalars(select(Hospitalization).where(
        Hospitalization.fecha_egreso.is_(None), Hospitalization.bed_id.is_not(None))).unique()}
    out = []
    for r in db.scalars(select(Room).order_by(Room.numero)).unique():
        beds = []
        for b in r.beds:
            h = occ.get(b.id)
            beds.append({
                "id": b.id, "etiqueta": b.etiqueta, "estado": "ocupada" if h else b.estado,
                "paciente": None if not h else {
                    "id": h.patient_id, "nombre_completo": h.patient.nombre_completo,
                    "tipo_documento": h.patient.tipo_documento, "documento": mask_doc(h.patient.documento),
                    "accesible": can_access_hospitalization(db, user, h)}})
        out.append({"id": r.id, "numero": r.numero, "camas": beds,
                    "ocupadas": sum(1 for x in beds if x["estado"] == "ocupada"), "total": len(beds)})
    return out


class BedState(BaseModel):
    estado: Literal["disponible", "reservada", "fuera_de_servicio"]


@router.patch("/beds/{bid}")
def set_bed_state(bid: int, data: BedState, request: Request, db: Session = Depends(get_db),
                  user: User = Depends(require("medico"))):
    b = db.get(Bed, bid)
    if not b:
        raise HTTPException(404, "Cama no encontrada")
    if db.scalar(select(Hospitalization.id).where(Hospitalization.bed_id == bid,
                                                  Hospitalization.fecha_egreso.is_(None))):
        raise HTTPException(409, "La cama está ocupada: traslade o egrese al paciente primero")
    b.estado = data.estado
    audit(db, user, "estado_cama", "bed", bid, {"estado": data.estado}, request.client.host if request.client else None)
    db.commit()
    return {"ok": True}
