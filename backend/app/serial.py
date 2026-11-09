"""Conversión de modelos a diccionarios de respuesta (con minimización de exposición de documentos)."""
from datetime import datetime, timedelta, timezone

from .config import settings
from .models import (Administration, Alert, Bed, Hospitalization, Patient, Prescription, PrescriptionVersion,
                     PreparationRecord)
from .services import mask_doc

LOCAL_TZ = timezone(timedelta(hours=settings.hospital_tz_offset_hours))


def local_now() -> datetime:
    return datetime.now(LOCAL_TZ)


def num(d) -> str | None:
    return None if d is None else format(d.normalize(), "f")


def hora(dt: datetime | None) -> str | None:
    return dt.astimezone(LOCAL_TZ).strftime("%H:%M") if dt else None


def bed_out(b: Bed | None):
    return None if not b else {"id": b.id, "habitacion": b.room.numero, "cama": b.etiqueta}


def patient_out(p: Patient, full_doc: bool = False) -> dict:
    return {"id": p.id, "nombres": p.nombres, "apellidos": p.apellidos, "nombre_completo": p.nombre_completo,
            "tipo_documento": p.tipo_documento, "documento": p.documento if full_doc else mask_doc(p.documento),
            "edad": p.edad, "sexo": p.sexo}


def clinical_out(p: Patient) -> dict:
    return {"fecha_nacimiento": p.fecha_nacimiento.isoformat(), "telefono": p.telefono,
            "peso_kg": num(p.peso_kg), "estatura_cm": num(p.estatura_cm), "alergias": p.alergias,
            "antecedentes": p.antecedentes, "observaciones": p.observaciones}


def hosp_out(h: Hospitalization, full_doc: bool = False) -> dict:
    return {"id": h.id, "paciente": patient_out(h.patient, full_doc), "cama": bed_out(h.bed),
            "diagnostico": h.diagnostico, "estado": h.estado, "fecha_ingreso": h.fecha_ingreso.isoformat(),
            "activa": h.activa, "medico": h.medico.nombre_completo, "medico_id": h.medico_id}


def version_out(v: PrescriptionVersion) -> dict:
    return {"id": v.id, "version": v.version, "medicamento": v.medication.nombre,
            "medication_id": v.medication_id, "principio_activo": v.medication.principio_activo,
            "presentacion": v.presentacion, "concentracion": v.concentracion, "dosis": num(v.dosis),
            "unidad": v.unidad, "via": v.via, "frecuencia": v.frecuencia, "horarios": v.horarios,
            "fecha_inicio": v.fecha_inicio.isoformat(), "fecha_fin": v.fecha_fin.isoformat(),
            "observaciones": v.observaciones, "motivo_cambio": v.motivo_cambio, "autor": v.author.nombre_completo,
            "creada": v.created_at.isoformat()}


def rx_out(rx: Prescription, versions: bool = False) -> dict:
    v = rx.vigente
    d = {"id": rx.id, "estado": rx.estado, "version_actual": rx.current_version,
         "paciente": patient_out(rx.patient), "cama": bed_out(rx.hospitalization.bed),
         "hospitalization_id": rx.hospitalization_id, "medico": rx.medico.nombre_completo,
         "motivo_suspension": rx.motivo_suspension, "vigente": version_out(v),
         "creada": rx.created_at.isoformat(), "paciente_id": rx.patient_id}
    if versions:
        d["versiones"] = [version_out(x) for x in rx.versions]
    return d


def prep_out(r: PreparationRecord) -> dict:
    return {"id": r.id, "medicamento": r.medication.nombre, "dosis": num(r.dosis), "unidad": r.unidad,
            "presentacion": r.presentacion, "concentracion": r.concentracion, "via": r.via,
            "hora_prevista": r.hora_prevista, "observaciones": r.observaciones, "estado": r.estado,
            "version": r.version.version, "creada": r.created_at.isoformat()}


def alert_out(a: Alert) -> dict:
    return {"id": a.id, "codigo": f"ALR-{a.id:05d}", "tipo": a.tipo, "severidad": a.severidad,
            "estado": a.estado, "paciente": patient_out(a.patient), "patient_id": a.patient_id,
            "medicamento": a.medicamento, "dosis_prescrita": a.dosis_prescrita,
            "dosis_registrada": a.dosis_registrada, "mensaje": a.mensaje, "detalle": a.detalle,
            "enfermera": a.nurse.nombre_completo if a.nurse else None,
            "medico": a.medico.nombre_completo if a.medico else None,
            "administration_id": a.administration_id, "prescription_id": a.prescription_id,
            "nota_revision": a.nota_revision, "resolucion": a.resolucion,
            "creada": a.created_at.isoformat(),
            "resuelta_en": a.resuelta_en.isoformat() if a.resuelta_en else None}


def adm_out(a: Administration, open_alerts: int = 0) -> dict:
    rx = a.prescription
    v = rx.vigente
    return {"id": a.id, "estado": a.estado, "programada_para": a.programada_para.isoformat(),
            "hora": hora(a.programada_para), "paciente": patient_out(a.patient),
            "cama": bed_out(rx.hospitalization.bed), "prescription_id": rx.id,
            "rx_estado": rx.estado, "medicamento": v.medication.nombre, "dosis": num(v.dosis),
            "unidad": v.unidad, "via": v.via, "version": v.version, "alertas_abiertas": open_alerts,
            "dosis_administrada": num(a.dosis_administrada), "unidad_administrada": a.unidad_administrada,
            "via_administrada": a.via_administrada, "administrada_en": a.administrada_en.isoformat()
            if a.administrada_en else None, "enfermera": a.nurse.nombre_completo if a.nurse else None,
            "observaciones": a.observaciones}
