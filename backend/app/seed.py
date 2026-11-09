"""Datos DEMOSTRATIVOS (ficticios). Las contraseñas se leen del entorno o se generan al azar y se imprimen una vez.

    python -m app.seed            # crea catálogo, usuarios, habitaciones, pacientes y prescripciones demo
    python -m app.seed --reset    # borra todo y vuelve a crear
"""
import os
import secrets
import sys
from datetime import date, timedelta

from sqlalchemy import select, text

from .config import settings
from .db import Base, SessionLocal, engine
from .models import (Alert, Bed, Hospitalization, Medication, NurseAssignment, Patient, Role, Room, User)
from .security import hash_password
from .services import audit

MEDS = [  # (nombre, principio activo, presentación, concentración, clase alergia, unidades)
    ("Amoxicilina", "amoxicilina", "Cápsula", "500 mg", "penicilina", ["mg", "g"]),
    ("Ceftriaxona", "ceftriaxona", "Vial inyectable", "1 g", "cefalosporina", ["mg", "g"]),
    ("Paracetamol", "paracetamol", "Tableta", "500 mg", None, ["mg", "g"]),
    ("Ibuprofeno", "ibuprofeno", "Tableta", "400 mg", "aine", ["mg", "g"]),
    ("Metformina", "metformina", "Tableta", "850 mg", None, ["mg", "g"]),
    ("Enoxaparina", "enoxaparina", "Jeringa prellenada", "40 mg/0,4 mL", None, ["mg", "UI"]),
    ("Heparina sódica", "heparina", "Vial", "5000 UI/mL", None, ["UI", "mL"]),
    ("Omeprazol", "omeprazol", "Cápsula", "20 mg", None, ["mg"]),
    ("Furosemida", "furosemida", "Ampolla", "20 mg/2 mL", "sulfonamida", ["mg", "mL"]),
    ("Dipirona", "metamizol", "Ampolla", "1 g/2 mL", "pirazolona", ["mg", "g", "mL"]),
    ("Salbutamol", "salbutamol", "Solución para nebulizar", "5 mg/mL", None, ["mg", "mL", "mcg"]),
    ("Medicamento A (demo)", "principio-demo-a", "Vial", "1 g", None, ["mg", "g"]),
]


INFO = {  # contenido educativo resumido; DEBE ser revisado por farmacia antes de uso real
    "Amoxicilina": ("Infecciones bacterianas sensibles.", "Alergia a penicilinas.", "Diarrea, náuseas, erupción cutánea."),
    "Ceftriaxona": ("Infecciones bacterianas graves sensibles.", "Alergia a cefalosporinas; precaución con alergia grave a penicilinas.", "Diarrea, reacciones locales, erupción."),
    "Paracetamol": ("Dolor leve a moderado y fiebre.", "Insuficiencia hepática grave; hipersensibilidad.", "Hepatotoxicidad en sobredosis."),
    "Ibuprofeno": ("Dolor, inflamación y fiebre.", "Úlcera activa, insuficiencia renal grave, alergia a AINE.", "Molestias gástricas, sangrado digestivo, daño renal."),
    "Metformina": ("Diabetes mellitus tipo 2.", "Insuficiencia renal grave, acidosis metabólica.", "Molestias digestivas; rara acidosis láctica."),
    "Enoxaparina": ("Prevención y tratamiento de trombosis.", "Sangrado activo, trombocitopenia por heparina.", "Sangrado, hematoma en sitio de inyección."),
    "Heparina sódica": ("Anticoagulación.", "Sangrado activo, trombocitopenia por heparina.", "Sangrado, trombocitopenia."),
    "Omeprazol": ("Reflujo y úlcera gastroduodenal.", "Hipersensibilidad a inhibidores de bomba de protones.", "Cefalea, diarrea, náuseas."),
    "Furosemida": ("Edema e insuficiencia cardíaca.", "Anuria, hipovolemia, alergia a sulfonamidas (precaución).", "Desequilibrio electrolítico, hipotensión."),
    "Dipirona": ("Dolor intenso y fiebre.", "Alergia a pirazolonas, alteraciones hematológicas.", "Hipotensión (IV rápida), reacciones alérgicas, agranulocitosis rara."),
    "Salbutamol": ("Broncoespasmo (asma, EPOC).", "Hipersensibilidad.", "Temblor, taquicardia, hipopotasemia."),
}


def pwd(var: str, shown: dict, key: str) -> str:
    p = getattr(settings, var.lower()) or os.environ.get(var) or secrets.token_urlsafe(12)
    shown[key] = p
    return p


def seed(reset: bool = False, *, show_passwords: bool = True):
    if reset:
        with engine.begin() as c:
            c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    Base.metadata.create_all(engine)  # en producción se usa Alembic; esto permite el arranque demo directo
    db = SessionLocal()
    shown: dict[str, str] = {}
    if db.scalar(select(User.id).limit(1)):
        print("La base ya tiene datos. Use --reset para recrearla.")
        return
    roles = {n: Role(nombre=n) for n in ("medico", "enfermera")}
    db.add_all(roles.values())
    db.flush()
    med = User(nombres="Iván", apellidos="(completar)", tipo_documento="CC", documento="9000000001",
               email="ivan@medialert.demo", password_hash=hash_password(pwd("SEED_DOCTOR_PASSWORD", shown, "ivan")),
               role_id=roles["medico"].id, registro_profesional="RM-DEMO-0001")
    enf = User(nombres="Sofía", apellidos="(completar)", tipo_documento="CC", documento="9000000002",
               email="sofia@medialert.demo", password_hash=hash_password(pwd("SEED_NURSE_PASSWORD", shown, "sofia")),
               role_id=roles["enfermera"].id, registro_profesional="RE-DEMO-0001")
    db.add_all([med, enf])
    meds = {}
    for n, pa, pres, conc, cls, un in MEDS:
        m = Medication(nombre=n, principio_activo=pa, presentacion=pres, concentracion=conc, clase_alergia=cls,
                       unidades_permitidas=un)
        if n in INFO:
            m.indicaciones, m.contraindicaciones, m.efectos_adversos = INFO[n]
            m.fuente = "Resumen educativo del prototipo; pendiente de validación farmacéutica"
        db.add(m)
        meds[n] = m
    beds = []
    for num in ("201", "202", "203", "204", "205"):
        r = Room(numero=num)
        db.add(r)
        db.flush()
        for lab in ("A", "B"):
            b = Bed(room_id=r.id, etiqueta=lab)
            db.add(b)
            beds.append(b)
    db.flush()
    beds[9].estado = "fuera_de_servicio"
    beds[8].estado = "reservada"

    pacientes = [  # nombres, apellidos, doc, nac, sexo, dx, alergias, cama idx
        ("Juan", "Pérez Gómez", "12345678", date(1968, 3, 14), "Masculino", "Neumonía adquirida en comunidad", None, 0),
        ("María", "Gómez Lara", "87654321", date(1975, 7, 2), "Femenino", "Diabetes mellitus tipo 2 descompensada", "Penicilina", 1),
        ("Carlos", "Rodríguez Silva", "11223344", date(1959, 11, 23), "Masculino", "Insuficiencia cardíaca", None, 3),
        ("Ana", "Martínez Ortiz", "10203040", date(1990, 1, 30), "Femenino", "Pielonefritis aguda", None, 2),
        ("Luis", "Herrera Cano", "20304050", date(1983, 5, 9), "Masculino", "Posoperatorio apendicectomía", None, 4),
        ("Sofía", "Ramírez Pinto", "30405060", date(2001, 9, 17), "Femenino", "Crisis asmática", None, 5),
        ("Pedro", "Castillo Mora", "40506070", date(1947, 12, 5), "Masculino", "EPOC exacerbado", "Sulfonamidas", 6),
        ("Elena", "Navarro Ruiz", "50607080", date(1979, 4, 21), "Femenino", "Trombosis venosa profunda", None, 7),
        ("Diego", "Salazar León", "60708090", date(1995, 8, 11), "Masculino", "Gastroenteritis aguda", None, None),
        ("Valentina", "Cruz Báez", "70809010", date(1988, 6, 26), "Femenino", "Celulitis en miembro inferior", None, None),
    ]
    hosps = []
    for i, (n, a, d, nac, sx, dx, al, bi) in enumerate(pacientes):
        p = Patient(nombres=n, apellidos=a, tipo_documento="CC", documento=d, fecha_nacimiento=nac, sexo=sx,
                    telefono="300000%04d" % i, peso_kg=60 + i * 3, estatura_cm=160 + i * 2, alergias=al,
                    antecedentes="Ficticio (demostración)", observaciones=None)
        db.add(p)
        db.flush()
        h = Hospitalization(patient_id=p.id, bed_id=beds[bi].id if bi is not None else None,
                            medico_id=med.id, fecha_ingreso=date.today() - timedelta(days=i % 4),
                            motivo=f"Hospitalización por {dx.lower()}", diagnostico=dx, descripcion="Caso ficticio.",
                            estado="estable" if i % 3 else "hospitalizado")
        db.add(h)
        db.flush()
        hosps.append(h)
        db.add(NurseAssignment(nurse_id=enf.id, hospitalization_id=h.id))
    db.flush()
    audit(db, None, "seed", "system", None, {"descripcion": "Datos demostrativos ficticios"})
    db.commit()

    # Prescripciones vía la misma lógica del servicio (versiones + eventos programados)
    from .routers.prescriptions import NewRx, create_rx
    from types import SimpleNamespace
    fake_req = SimpleNamespace(client=None)
    hoy = date.today()
    plan = [
        (0, "Medicamento A (demo)", "1", "g", "Intravenosa", ["08:00", "20:00"]),
        (0, "Ceftriaxona", "1", "g", "Intravenosa", ["09:00"]),
        (1, "Metformina", "850", "mg", "Oral", ["08:00", "20:00"]),
        (1, "Paracetamol", "500", "mg", "Oral", ["10:00", "16:00"]),
        (2, "Furosemida", "20", "mg", "Intravenosa", ["12:00"]),
        (3, "Ceftriaxona", "1", "g", "Intravenosa", ["09:00", "21:00"]),
        (4, "Dipirona", "1", "g", "Intravenosa", ["14:00", "22:00"]),
        (5, "Salbutamol", "5", "mg", "Inhalatoria", ["11:00", "17:00"]),
        (6, "Omeprazol", "20", "mg", "Oral", ["07:00"]),
        (7, "Enoxaparina", "40", "mg", "Subcutánea", ["08:00", "20:00"]),
    ]
    for pi, mname, dose, unit, via, hs in plan:
        h = hosps[pi]
        doctor = db.get(User, h.medico_id)
        m = meds[mname]
        db.expire_all()
        create_rx(NewRx(patient_id=h.patient_id, medication_id=m.id, presentacion=m.presentacion,
                        concentracion=m.concentracion, dosis=dose, unidad=unit, via=via,
                        frecuencia=f"{len(hs)} vez/veces al día", horarios=hs, fecha_inicio=hoy - timedelta(days=1),
                        fecha_fin=hoy + timedelta(days=4), observaciones="Prescripción ficticia de demostración"),
                  fake_req, db, doctor)
    if show_passwords:
        print("\nUsuarios ficticios (anote las claves; solo se muestran ahora):")
        for k, v in shown.items():
            print(f"  {k + '@medialert.demo':32s} {v}")


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
