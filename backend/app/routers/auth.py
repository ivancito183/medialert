from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal, get_db
from ..models import Notification, User, UserSession, now
from ..security import COOKIE, create_session, current_user, decode_token, require, verify_password
from ..services import audit, hub

router = APIRouter()


class LoginIn(BaseModel):
    email: str
    password: str


def user_out(u: User) -> dict:
    return {"id": u.id, "nombres": u.nombres, "apellidos": u.apellidos, "nombre_completo": u.nombre_completo,
            "email": u.email, "rol": u.rol, "tipo_documento": u.tipo_documento, "documento": u.documento,
            "registro_profesional": u.registro_profesional, "activo": u.activo}


@router.post("/auth/login")
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    ident = data.email.strip().lower()
    u = db.scalar(select(User).where((User.email == ident) | (User.documento == ident) | User.email.startswith(ident + "@", autoescape=True)))
    generic = HTTPException(401, "Credenciales inválidas")
    if not u or not u.activo:
        audit(db, None, "login_fallido", "user", None, {"email": data.email[:80]}, ip)
        db.commit()
        raise generic
    if u.locked_until and u.locked_until > now():
        raise HTTPException(423, "Cuenta bloqueada temporalmente por intentos fallidos. Intente más tarde.")
    if not verify_password(data.password, u.password_hash):
        u.failed_attempts += 1
        if u.failed_attempts >= settings.max_failed_logins:
            u.locked_until = now() + timedelta(minutes=settings.lockout_minutes)
            u.failed_attempts = 0
        audit(db, u, "login_fallido", "user", u.id, None, ip)
        db.commit()
        raise generic
    u.failed_attempts, u.locked_until = 0, None
    token = create_session(db, u)
    audit(db, u, "login", "user", u.id, None, ip)
    db.commit()
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=settings.cookie_secure,
                        max_age=settings.session_hours * 3600, path="/")
    return user_out(u)


@router.post("/auth/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(current_user)):
    import jwt
    try:
        jti = jwt.decode(request.cookies.get(COOKIE), settings.secret_key, algorithms=["HS256"])["jti"]
        s = db.get(UserSession, jti)
        if s:
            s.revoked = True
    except Exception:
        pass
    audit(db, user, "logout", "user", user.id)
    db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.get("/users/nurses")
def nurses(db: Session = Depends(get_db), user: User = Depends(require("medico"))):
    rows = db.scalars(select(User).join(User.role).where(User.activo, User.role.has(nombre="enfermera"))
                      .order_by(User.apellidos))
    return [{"id": n.id, "nombre": n.nombre_completo} for n in rows]


# --------------------------------------------------------- notificaciones
@router.get("/notifications")
def list_notifications(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id)
                      .order_by(Notification.id.desc()).limit(50)).all()
    return {"no_leidas": sum(1 for r in rows if not r.leida),
            "items": [{"id": r.id, "tipo": r.tipo, "severidad": r.severidad, "titulo": r.titulo,
                       "mensaje": r.mensaje, "enlace": r.enlace, "leida": r.leida,
                       "creada": r.created_at.isoformat()} for r in rows]}


@router.post("/notifications/read-all")
def read_all(db: Session = Depends(get_db), user: User = Depends(current_user)):
    for n in db.scalars(select(Notification).where(Notification.user_id == user.id, ~Notification.leida)):
        n.leida = True
    db.commit()
    return {"ok": True}


@router.post("/notifications/{nid}/read")
def read_one(nid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    n = db.get(Notification, nid)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "No encontrada")
    n.leida = True
    db.commit()
    return {"ok": True}


# -------------------------------------------------------------- WebSocket
@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    origin = ws.headers.get("origin")
    same_host = origin and origin.split("://", 1)[-1] == ws.headers.get("host")
    if origin and not same_host and origin not in [o.strip() for o in settings.cors_origins.split(",")]:
        await ws.close(code=4403)
        return
    db = SessionLocal()
    try:
        token = ws.cookies.get(COOKIE)
        u = decode_token(token, db) if token else None
        uid = u.id if u else None
    finally:
        db.close()
    if uid is None:
        await ws.close(code=4401)
        return
    await ws.accept()
    hub.loop = __import__("asyncio").get_running_loop()
    await hub.connect(uid, ws)
    try:
        while True:
            await ws.receive_text()  # mantiene viva la conexión (ping del cliente)
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(uid, ws)
