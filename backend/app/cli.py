"""Creación de cuentas por personal autorizado (no existe registro público).

    python -m app.cli create-user --rol enfermera --email x@hospital.org --nombres Ana --apellidos Ruiz \
        --tipo-doc CC --documento 123456 [--registro RE-123]
La contraseña se solicita por consola (no queda en el historial).
"""
import argparse
import getpass

from sqlalchemy import select

from .db import SessionLocal
from .models import Role, User
from .security import hash_password


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-user")
    c.add_argument("--rol", choices=["medico", "enfermera"], required=True)
    c.add_argument("--email", required=True)
    c.add_argument("--nombres", required=True)
    c.add_argument("--apellidos", required=True)
    c.add_argument("--tipo-doc", default="CC")
    c.add_argument("--documento", required=True)
    c.add_argument("--registro")
    a = ap.parse_args()
    pw = getpass.getpass("Contraseña (mín. 12 caracteres): ")
    if len(pw) < 12:
        raise SystemExit("La contraseña es demasiado corta")
    db = SessionLocal()
    role = db.scalar(select(Role).where(Role.nombre == a.rol))
    db.add(User(nombres=a.nombres, apellidos=a.apellidos, tipo_documento=a.tipo_doc, documento=a.documento,
                email=a.email.lower(), password_hash=hash_password(pw), role_id=role.id,
                registro_profesional=a.registro))
    db.commit()
    print("Usuario creado.")


if __name__ == "__main__":
    main()
