"""Genera los casos públicos a partir del motor de MediAlert."""
import json
from decimal import Decimal
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.engine.rules import compare_dose

cases = [
    ("Dosis equivalente", "1", "g", "1000", "mg"),
    ("Dosis multiplicada por 45", "1", "g", "45", "g"),
    ("Error de unidad", "500", "mg", "500", "g"),
    ("Unidad incompatible", "500", "mg", "500", "mL"),
]

results = []
for title, prescribed, prescribed_unit, entered, entered_unit in cases:
    finding = compare_dose(Decimal(prescribed), prescribed_unit, Decimal(entered), entered_unit)
    results.append({
        "title": title,
        "prescribed": f"{prescribed} {prescribed_unit}",
        "entered": f"{entered} {entered_unit}",
        "blocked": bool(finding and finding.bloquea),
        "message": finding.mensaje if finding else "Las cantidades son equivalentes después de convertir las unidades.",
    })

(ROOT / "docs" / "cases.json").write_text(
    json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
