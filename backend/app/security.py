"""Hash de contraseñas (Argon2id), tokens de sesión y dependencias de autorización."""
import uuid
from datetime import timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from fastapi import Depends, HTTPException, Request
from starlette.requests import HTTPConnection
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User, UserSession, now

COOKIE = "ma_session"
_ph = PasswordHasher()


def hash_password(p: str) -> str:
    return _ph.hash(p)


def verify_password(p: str, h: str) -> bool:
    try:
        return _ph.verify(h, p)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_session(db: Session, user: User) -> str:
    jti = uuid.uuid4().hex
    exp = now() + timedelta(hours=settings.session_hours)
    db.add(UserSession(id=jti, user_id=user.id, expires_at=exp))
    db.flush()
    return jwt.encode({"sub": str(user.id), "jti": jti, "exp": exp}, settings.secret_key, algorithm="HS256")


def decode_token(token: str, db: Session) -> User | None:
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    s = db.get(UserSession, data.get("jti"))
    if not s or s.revoked or s.expires_at < now():
        return None
    u = db.get(User, int(data["sub"]))
    return u if u and u.activo else None


def csrf_guard(request: HTTPConnection):
    """Las mutaciones exigen un encabezado personalizado: un sitio externo no puede enviarlo
    sin pasar por CORS (que solo permite el origen de MediAlert)."""
    if request.scope["type"] != "http":
        return
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-requested-with") != "medialert":
        raise HTTPException(403, "Solicitud no permitida")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE)
    user = decode_token(token, db) if token else None
    if not user:
        raise HTTPException(401, "Sesión no válida o expirada")
    request.state.user = user
    return user


def require(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.rol not in roles:
            raise HTTPException(403, "Su rol no tiene permiso para esta acción")
        return user
    return dep
