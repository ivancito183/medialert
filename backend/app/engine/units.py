"""Unidades y conversiones exactas (Decimal).

Solo se consideran equivalentes unidades de la MISMA magnitud (masa con masa,
volumen con volumen). Las unidades internacionales (UI) miden actividad
biológica propia de cada sustancia: nunca se convierten a masa ni volumen.
"""
from decimal import Decimal, InvalidOperation

# símbolo -> (magnitud, factor a la unidad base)
UNITS: dict[str, tuple[str, Decimal]] = {
    "mcg": ("masa", Decimal("0.000001")),
    "mg": ("masa", Decimal("0.001")),
    "g": ("masa", Decimal("1")),
    "mL": ("volumen", Decimal("1")),
    "L": ("volumen", Decimal("1000")),
    "UI": ("actividad", Decimal("1")),
}
ALIASES = {"µg": "mcg", "ug": "mcg", "microgramos": "mcg", "ml": "mL", "l": "L", "ui": "UI", "iu": "UI"}
MAX_VALUE = Decimal("1000000000")


class InvalidDose(ValueError):
    pass


def canon_unit(unit: str) -> str:
    u = (unit or "").strip()
    if u not in UNITS:
        u = ALIASES.get(u, ALIASES.get(u.lower(), u))
    if u not in UNITS:
        raise InvalidDose(f"Unidad no reconocida: '{unit}'")
    return u


def to_decimal(value) -> Decimal:
    if value is None or (isinstance(value, str) and not value.strip()):
        raise InvalidDose("La dosis está vacía")
    try:
        d = Decimal(str(value).strip().replace(",", "."))
    except (InvalidOperation, ValueError):
        raise InvalidDose("La dosis no es un número válido")
    if not d.is_finite():
        raise InvalidDose("La dosis no es un número finito")
    if d <= 0:
        raise InvalidDose("La dosis debe ser mayor que cero")
    if d > MAX_VALUE:
        raise InvalidDose("La dosis excede el valor máximo permitido por el sistema")
    return d


def magnitude(unit: str) -> str:
    return UNITS[canon_unit(unit)][0]


def to_base(value: Decimal, unit: str) -> Decimal:
    return value * UNITS[canon_unit(unit)][1]


def fmt(value: Decimal, unit: str) -> str:
    s = format(value.normalize(), "f")
    return f"{s} {canon_unit(unit)}"
