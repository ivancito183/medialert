"""Modelo de datos de MediAlert (PostgreSQL)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer,
                        Numeric, String, Text, UniqueConstraint, text)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, UTCDateTime


def now() -> datetime:
    return datetime.now(timezone.utc)


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(20), unique=True)  # medico | enfermera


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tipo_documento", "documento"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    nombres: Mapped[str] = mapped_column(String(100))
    apellidos: Mapped[str] = mapped_column(String(100))
    tipo_documento: Mapped[str] = mapped_column(String(5))
    documento: Mapped[str] = mapped_column(String(30))
    email: Mapped[str] = mapped_column(String(200), unique=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    registro_profesional: Mapped[str | None] = mapped_column(String(40))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    role: Mapped[Role] = relationship(lazy="joined")

    @property
    def rol(self) -> str:
        return self.role.nombre

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombres} {self.apellidos}"


class UserSession(Base):
    __tablename__ = "user_sessions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # jti
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)


class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = (UniqueConstraint("tipo_documento", "documento", name="uq_patient_doc"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    nombres: Mapped[str] = mapped_column(String(100))
    apellidos: Mapped[str] = mapped_column(String(100))
    tipo_documento: Mapped[str] = mapped_column(String(5))
    documento: Mapped[str] = mapped_column(String(30))
    fecha_nacimiento: Mapped[date] = mapped_column(Date)
    sexo: Mapped[str] = mapped_column(String(15))
    telefono: Mapped[str | None] = mapped_column(String(30))
    peso_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    estatura_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    alergias: Mapped[str | None] = mapped_column(Text)
    antecedentes: Mapped[str | None] = mapped_column(Text)
    observaciones: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombres} {self.apellidos}"

    @property
    def edad(self) -> int:
        t = date.today()
        b = self.fecha_nacimiento
        return t.year - b.year - ((t.month, t.day) < (b.month, b.day))


class Room(Base):
    __tablename__ = "rooms"
    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[str] = mapped_column(String(10), unique=True)
    beds: Mapped[list["Bed"]] = relationship(back_populates="room", order_by="Bed.etiqueta")


class Bed(Base):
    __tablename__ = "beds"
    __table_args__ = (UniqueConstraint("room_id", "etiqueta"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"))
    etiqueta: Mapped[str] = mapped_column(String(5))
    # disponible | reservada | fuera_de_servicio  (ocupada se deriva de la hospitalización activa)
    estado: Mapped[str] = mapped_column(String(20), default="disponible")
    room: Mapped[Room] = relationship(back_populates="beds", lazy="joined")


class Hospitalization(Base):
    __tablename__ = "hospitalizations"
    __table_args__ = (
        # Una cama no puede tener dos pacientes activos a la vez.
        Index("uq_active_bed", "bed_id", unique=True,
              postgresql_where=text("fecha_egreso IS NULL AND bed_id IS NOT NULL"),
              sqlite_where=text("fecha_egreso IS NULL AND bed_id IS NOT NULL")),
        # Un paciente solo tiene un episodio activo.
        Index("uq_active_patient", "patient_id", unique=True,
              postgresql_where=text("fecha_egreso IS NULL"), sqlite_where=text("fecha_egreso IS NULL")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    bed_id: Mapped[int | None] = mapped_column(ForeignKey("beds.id"))
    medico_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    fecha_ingreso: Mapped[date] = mapped_column(Date)
    fecha_egreso: Mapped[datetime | None] = mapped_column(UTCDateTime)
    motivo: Mapped[str] = mapped_column(Text)
    diagnostico: Mapped[str] = mapped_column(String(300))
    descripcion: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(String(20), default="hospitalizado")  # hospitalizado|estable|critico|egresado
    patient: Mapped[Patient] = relationship(lazy="joined")
    bed: Mapped[Bed | None] = relationship(lazy="joined")
    medico: Mapped[User] = relationship(lazy="joined")

    @property
    def activa(self) -> bool:
        return self.fecha_egreso is None


class NurseAssignment(Base):
    __tablename__ = "nurse_assignments"
    __table_args__ = (UniqueConstraint("nurse_id", "hospitalization_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    nurse_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    hospitalization_id: Mapped[int] = mapped_column(ForeignKey("hospitalizations.id"))


class Medication(Base):
    __tablename__ = "medications"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True)
    principio_activo: Mapped[str] = mapped_column(String(120))
    presentacion: Mapped[str] = mapped_column(String(80))
    concentracion: Mapped[str | None] = mapped_column(String(80))
    # Clase para cruce de alergias (catálogo demostrativo; requiere validación farmacológica)
    clase_alergia: Mapped[str | None] = mapped_column(String(60))
    unidades_permitidas: Mapped[list] = mapped_column(JSON, default=list)
    # Ficha farmacológica EDUCATIVA (no se usa para validar dosis; requiere revisión por farmacia)
    indicaciones: Mapped[str | None] = mapped_column(Text)
    contraindicaciones: Mapped[str | None] = mapped_column(Text)
    efectos_adversos: Mapped[str | None] = mapped_column(Text)
    fuente: Mapped[str | None] = mapped_column(String(200))


class Prescription(Base):
    __tablename__ = "prescriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    hospitalization_id: Mapped[int] = mapped_column(ForeignKey("hospitalizations.id"))
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    medico_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    estado: Mapped[str] = mapped_column(String(15), default="activa")  # activa|suspendida
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    motivo_suspension: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    hospitalization: Mapped[Hospitalization] = relationship(lazy="joined")
    patient: Mapped[Patient] = relationship(lazy="joined")
    medico: Mapped[User] = relationship(lazy="joined")
    versions: Mapped[list["PrescriptionVersion"]] = relationship(
        back_populates="prescription", order_by="PrescriptionVersion.version")

    @property
    def vigente(self) -> "PrescriptionVersion":
        return next(v for v in self.versions if v.version == self.current_version)


class PrescriptionVersion(Base):
    """Cada modificación crea una versión nueva; las anteriores no se alteran."""
    __tablename__ = "prescription_versions"
    __table_args__ = (UniqueConstraint("prescription_id", "version"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    prescription_id: Mapped[int] = mapped_column(ForeignKey("prescriptions.id"))
    version: Mapped[int] = mapped_column(Integer)
    medication_id: Mapped[int] = mapped_column(ForeignKey("medications.id"))
    presentacion: Mapped[str] = mapped_column(String(80))
    concentracion: Mapped[str | None] = mapped_column(String(80))
    dosis: Mapped[Decimal] = mapped_column(Numeric(14, 4))
    unidad: Mapped[str] = mapped_column(String(10))
    via: Mapped[str] = mapped_column(String(30))
    frecuencia: Mapped[str] = mapped_column(String(60))
    horarios: Mapped[list] = mapped_column(JSON)  # ["08:00", "20:00"]
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date)
    observaciones: Mapped[str | None] = mapped_column(Text)
    motivo_cambio: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    prescription: Mapped[Prescription] = relationship(back_populates="versions")
    medication: Mapped[Medication] = relationship(lazy="joined")
    author: Mapped[User] = relationship(lazy="joined")


class Administration(Base):
    """Evento programado de medicación (una toma) y su resultado."""
    __tablename__ = "administrations"
    __table_args__ = (UniqueConstraint("prescription_id", "programada_para"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    prescription_id: Mapped[int] = mapped_column(ForeignKey("prescriptions.id"))
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    programada_para: Mapped[datetime] = mapped_column(UTCDateTime)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    # Resultado real (distinto de lo preparado y de lo previsto)
    dosis_administrada: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    unidad_administrada: Mapped[str | None] = mapped_column(String(10))
    via_administrada: Mapped[str | None] = mapped_column(String(30))
    version_administrada: Mapped[int | None] = mapped_column(Integer)
    administrada_en: Mapped[datetime | None] = mapped_column(UTCDateTime)
    nurse_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    observaciones: Mapped[str | None] = mapped_column(Text)
    prescription: Mapped[Prescription] = relationship(lazy="joined")
    patient: Mapped[Patient] = relationship(lazy="joined")
    nurse: Mapped[User | None] = relationship(lazy="joined")


class PreparationRecord(Base):
    __tablename__ = "preparation_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    administration_id: Mapped[int] = mapped_column(ForeignKey("administrations.id"))
    prescription_version_id: Mapped[int] = mapped_column(ForeignKey("prescription_versions.id"))
    nurse_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    medication_id: Mapped[int] = mapped_column(ForeignKey("medications.id"))
    dosis: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    unidad: Mapped[str] = mapped_column(String(10))
    presentacion: Mapped[str | None] = mapped_column(String(80))
    concentracion: Mapped[str | None] = mapped_column(String(80))
    via: Mapped[str] = mapped_column(String(30))
    hora_prevista: Mapped[str | None] = mapped_column(String(5))
    documento_verificado: Mapped[str] = mapped_column(String(30))
    observaciones: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(String(15))  # verificada | bloqueada
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    medication: Mapped[Medication] = relationship(lazy="joined")
    version: Mapped[PrescriptionVersion] = relationship(lazy="joined")


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(30))
    severidad: Mapped[str] = mapped_column(String(10))  # critica | advertencia
    estado: Mapped[str] = mapped_column(String(20), default="activa")  # activa|pendiente_revision|resuelta
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    prescription_id: Mapped[int | None] = mapped_column(ForeignKey("prescriptions.id"))
    prescription_version_id: Mapped[int | None] = mapped_column(ForeignKey("prescription_versions.id"))
    administration_id: Mapped[int | None] = mapped_column(ForeignKey("administrations.id"))
    preparation_id: Mapped[int | None] = mapped_column(ForeignKey("preparation_records.id"))
    nurse_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    medico_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    medicamento: Mapped[str | None] = mapped_column(String(120))
    dosis_prescrita: Mapped[str | None] = mapped_column(String(60))
    dosis_registrada: Mapped[str | None] = mapped_column(String(60))
    mensaje: Mapped[str] = mapped_column(Text)
    detalle: Mapped[dict | None] = mapped_column(JSON)  # insumos exactos que originaron la discrepancia
    nota_revision: Mapped[str | None] = mapped_column(Text)
    resolucion: Mapped[str | None] = mapped_column(Text)
    resuelta_por: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    resuelta_en: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    patient: Mapped[Patient] = relationship(lazy="joined")
    nurse: Mapped[User | None] = relationship(foreign_keys=[nurse_id], lazy="joined")
    medico: Mapped[User | None] = relationship(foreign_keys=[medico_id], lazy="joined")


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(30))
    severidad: Mapped[str] = mapped_column(String(10), default="info")
    titulo: Mapped[str] = mapped_column(String(160))
    mensaje: Mapped[str] = mapped_column(Text)
    enlace: Mapped[str | None] = mapped_column(String(200))
    leida: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)


class AuditLog(Base):
    """Bitácora encadenada por hash: alterar una fila rompe la cadena."""
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    accion: Mapped[str] = mapped_column(String(50))
    entidad: Mapped[str] = mapped_column(String(40))
    entidad_id: Mapped[int | None] = mapped_column(Integer)
    detalle: Mapped[dict | None] = mapped_column(JSON)
    ip: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))
    user: Mapped[User | None] = relationship(lazy="joined")
