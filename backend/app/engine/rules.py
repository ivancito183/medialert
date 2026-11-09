"""Motor de validación determinístico de MediAlert.

Funciones puras: reciben datos, devuelven hallazgos (Finding). No acceden a la
base de datos ni a la interfaz, por lo que son verificables con pruebas unitarias.

IMPORTANTE: coincidir con la prescripción NO implica que la dosis sea segura.
Dosis máxima, interacciones y contraindicaciones requieren fuentes farmacológicas
validadas y no están implementadas (ver README, sección de validación clínica).
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal

from . import units as U

CRITICA, ADVERTENCIA = "critica", "advertencia"


@dataclass
class Finding:
    tipo: str          # dosis | unidad | medicamento | paciente | via | horario | suspendida | ...
    severidad: str
    mensaje: str
    detalle: dict = field(default_factory=dict)

    @property
    def bloquea(self) -> bool:
        return self.severidad == CRITICA


@dataclass
class RuleConfig:
    dose_tolerance_pct: Decimal = Decimal("0")
    schedule_window_minutes: int = 60


@dataclass
class Prescribed:
    medication_id: int
    medication_name: str
    dose: Decimal
    unit: str
    route: str
    version: int
    status: str            # activa | suspendida
    concentration: str | None = None
    scheduled_at: datetime | None = None


@dataclass
class Registered:
    medication_id: int
    dose: Decimal
    unit: str
    route: str
    patient_document: str
    version: int | None = None
    concentration: str | None = None
    at: datetime | None = None  # momento de la acción, para la regla de horario


def _num(d: Decimal) -> str:
    return format(d.normalize(), "f")


def compare_dose(p_dose: Decimal, p_unit: str, r_dose: Decimal, r_unit: str,
                 cfg: RuleConfig | None = None) -> Finding | None:
    """Compara dosis tras normalizar unidades compatibles."""
    cfg = cfg or RuleConfig()
    p_unit, r_unit = U.canon_unit(p_unit), U.canon_unit(r_unit)
    base = {"dosis_prescrita": U.fmt(p_dose, p_unit), "dosis_registrada": U.fmt(r_dose, r_unit)}

    if U.magnitude(p_unit) != U.magnitude(r_unit):
        return Finding("unidad", CRITICA,
                       f"La unidad registrada ({r_unit}) no es compatible con la prescrita ({p_unit}): "
                       f"miden magnitudes distintas ({U.magnitude(r_unit)} vs {U.magnitude(p_unit)}).",
                       {**base, "motivo": "magnitud_incompatible"})

    pb, rb = U.to_base(p_dose, p_unit), U.to_base(r_dose, r_unit)
    ratio = rb / pb
    tol = cfg.dose_tolerance_pct / Decimal(100)
    if abs(ratio - 1) <= tol:
        return None  # equivalentes (por ejemplo 1 g == 1000 mg)

    ratio_s = _num(ratio.quantize(Decimal("0.01")))
    detalle = {**base, "ratio": ratio_s}
    if p_unit != r_unit and p_dose == r_dose:
        # mismo número, otra unidad: típico error de unidad (500 mg vs 500 g)
        return Finding("unidad", CRITICA,
                       f"Error de unidad: la cantidad numérica coincide ({_num(p_dose)}) pero la unidad "
                       f"registrada ({r_unit}) difiere de la prescrita ({p_unit}). "
                       f"Equivale a {ratio_s} veces la dosis prescrita.", detalle)
    if ratio > 1:
        rel = f"{ratio_s} veces la dosis prescrita"
    else:
        rel = f"{_num((ratio * 100).quantize(Decimal('0.1')))} % de la dosis prescrita"
    return Finding("dosis", CRITICA,
                   f"La dosis registrada ({base['dosis_registrada']}) no coincide con la prescripción vigente "
                   f"({base['dosis_prescrita']}). Diferencia: {rel}.", detalle)


def validate(p: Prescribed, r: Registered, patient_document: str, allergy_hits: list[str] | None = None,
             cfg: RuleConfig | None = None) -> list[Finding]:
    cfg = cfg or RuleConfig()
    out: list[Finding] = []

    if p.status == "suspendida":
        out.append(Finding("suspendida", CRITICA, "La prescripción está SUSPENDIDA: no se puede administrar."))

    if r.version is not None and r.version != p.version:
        out.append(Finding("prescripcion_modificada", CRITICA,
                           f"La prescripción cambió (versión {r.version} → {p.version}). "
                           "Actualice la información con la versión vigente antes de continuar.",
                           {"version_registro": r.version, "version_vigente": p.version}))

    if r.patient_document.strip() != patient_document.strip():
        out.append(Finding("paciente", CRITICA,
                           "El documento verificado no coincide con el del paciente de esta prescripción. "
                           "Confirme la identidad con la manilla/identificación institucional.",
                           {"documento_esperado_termina_en": patient_document[-3:]}))

    if r.medication_id != p.medication_id:
        out.append(Finding("medicamento", CRITICA,
                           f"El medicamento registrado no corresponde al prescrito ({p.medication_name}).",
                           {"medicamento_prescrito": p.medication_name}))

    f = compare_dose(p.dose, p.unit, r.dose, r.unit, cfg)
    if f:
        out.append(f)

    if r.route.strip().lower() != p.route.strip().lower():
        out.append(Finding("via", CRITICA,
                           f"La vía registrada ({r.route}) difiere de la prescrita ({p.route}).",
                           {"via_prescrita": p.route, "via_registrada": r.route}))

    if p.concentration and r.concentration and \
            r.concentration.strip().lower() != p.concentration.strip().lower():
        out.append(Finding("concentracion", ADVERTENCIA,
                           f"La concentración registrada ({r.concentration}) difiere de la prescrita "
                           f"({p.concentration}). Verifique el producto.",
                           {"prescrita": p.concentration, "registrada": r.concentration}))

    if p.scheduled_at and r.at:
        delta = abs(r.at - p.scheduled_at)
        if delta > timedelta(minutes=cfg.schedule_window_minutes):
            mins = int(delta.total_seconds() // 60)
            out.append(Finding("horario", ADVERTENCIA,
                               f"El registro está a {mins} min del horario programado "
                               f"(ventana institucional: ±{cfg.schedule_window_minutes} min).",
                               {"minutos_diferencia": mins}))

    for hit in allergy_hits or []:
        out.append(Finding("alergia", ADVERTENCIA,
                           f"Posible alergia registrada: '{hit}' coincide con el medicamento. "
                           "Confirme con el médico antes de administrar.", {"coincidencia": hit}))
    return out


def allergy_matches(allergies: str | None, active_ingredient: str, drug_class: str | None) -> list[str]:
    """Coincidencia textual contra el catálogo (DEMOSTRATIVO; requiere validación farmacológica)."""
    if not allergies:
        return []
    text = allergies.lower()
    return [t for t in (active_ingredient, drug_class) if t and t.lower() in text]
