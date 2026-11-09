"""Servicios transversales: auditoría encadenada, notificaciones en tiempo real y acceso por responsabilidad."""
import asyncio
import hashlib
import json
from collections import defaultdict

from fastapi import HTTPException, WebSocket
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import (Alert, AuditLog, Hospitalization, Notification, NurseAssignment, User, now)

# ---------------------------------------------------------------- auditoría


def audit(db: Session, user: User | None, accion: str, entidad: str, entidad_id: int | None = None,
          detalle: dict | None = None, ip: str | None = None) -> AuditLog:
    db.execute(select(AuditLog.id).order_by(AuditLog.id.desc()).limit(1).with_for_update())  # serializa cadena
    last = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(1)).first()
    prev = last.hash if last else "0" * 64
    ts = now()
    payload = json.dumps([prev, user.id if user else None, accion, entidad, entidad_id, detalle, ts.isoformat()],
                         sort_keys=True, default=str)
    row = AuditLog(user_id=user.id if user else None, accion=accion, entidad=entidad, entidad_id=entidad_id,
                   detalle=detalle, ip=ip, created_at=ts, prev_hash=prev,
                   hash=hashlib.sha256(payload.encode()).hexdigest())
    db.add(row)
    db.flush()
    return row


def verify_audit_chain(db: Session) -> dict:
    prev = "0" * 64
    n = 0
    for r in db.scalars(select(AuditLog).order_by(AuditLog.id)):
        payload = json.dumps([prev, r.user_id, r.accion, r.entidad, r.entidad_id, r.detalle,
                              r.created_at.isoformat()], sort_keys=True, default=str)
        if r.prev_hash != prev or r.hash != hashlib.sha256(payload.encode()).hexdigest():
            return {"integra": False, "primer_registro_alterado": r.id, "verificados": n}
        prev = r.hash
        n += 1
    return {"integra": True, "verificados": n}


# ---------------------------------------------------------- tiempo real (WS)


class Hub:
    def __init__(self):
        self.conns: dict[int, set[WebSocket]] = defaultdict(set)
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, uid: int, ws: WebSocket):
        self.conns[uid].add(ws)

    def disconnect(self, uid: int, ws: WebSocket):
        self.conns[uid].discard(ws)

    async def _send(self, uid: int, data: dict):
        for ws in list(self.conns.get(uid, ())):
            try:
                await ws.send_json(data)
            except Exception:
                self.conns[uid].discard(ws)

    def flush(self, session: Session):
        """Tras el commit envía lo acumulado en la sesión (hilo síncrono) al bucle asyncio."""
        items = session.info.pop("ws", [])
        if self.loop:
            for uid, data in items:
                asyncio.run_coroutine_threadsafe(self._send(uid, data), self.loop)


hub = Hub()


def notify(db: Session, user_id: int | None, tipo: str, titulo: str, mensaje: str, enlace: str | None = None,
           severidad: str = "info"):
    if not user_id:
        return
    n = Notification(user_id=user_id, tipo=tipo, titulo=titulo, mensaje=mensaje, enlace=enlace, severidad=severidad)
    db.add(n)
    db.flush()
    db.info.setdefault("ws", []).append((user_id, {"event": "notification", "id": n.id, "tipo": tipo, "severidad": severidad,
                                   "titulo": titulo, "mensaje": mensaje, "enlace": enlace}))


def notify_nurses_of(db: Session, hosp_id: int, tipo: str, titulo: str, mensaje: str, enlace: str | None = None,
                     severidad: str = "info"):
    for nid in db.scalars(select(NurseAssignment.nurse_id).where(NurseAssignment.hospitalization_id == hosp_id)):
        notify(db, nid, tipo, titulo, mensaje, enlace, severidad)


# ------------------------------------------------ acceso por responsabilidad


def can_access_hospitalization(db: Session, user: User, h: Hospitalization) -> bool:
    if user.rol == "medico":
        return h.medico_id == user.id
    return db.scalar(select(NurseAssignment.id).where(NurseAssignment.nurse_id == user.id,
                                                      NurseAssignment.hospitalization_id == h.id)) is not None


def ensure_access(db: Session, user: User, h: Hospitalization):
    if not can_access_hospitalization(db, user, h):
        raise HTTPException(403, "No tiene responsabilidad asistencial sobre este paciente")


def mask_doc(doc: str) -> str:
    return "•" * max(len(doc) - 4, 0) + doc[-4:]


# ---------------------------------------------------------------- alertas


def raise_alert(db: Session, *, finding, patient_id, prescription=None, version=None, administration=None,
                preparation=None, nurse_id=None, medico_id=None, medicamento=None) -> Alert:
    a = Alert(tipo=finding.tipo, severidad=finding.severidad, patient_id=patient_id,
              prescription_id=prescription.id if prescription else None,
              prescription_version_id=version.id if version else None,
              administration_id=administration.id if administration else None,
              preparation_id=preparation.id if preparation else None,
              nurse_id=nurse_id, medico_id=medico_id, medicamento=medicamento,
              dosis_prescrita=finding.detalle.get("dosis_prescrita"),
              dosis_registrada=finding.detalle.get("dosis_registrada"),
              mensaje=finding.mensaje, detalle=finding.detalle)
    db.add(a)
    db.flush()
    return a


event.listen(SessionLocal, "after_commit", hub.flush)
event.listen(SessionLocal, "after_rollback", lambda s: s.info.pop("ws", None))
