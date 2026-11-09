"""Pruebas unitarias del motor: conversiones, datos inválidos, decimales y extremos."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal as D

import pytest

from app.engine import units as U
from app.engine.rules import Prescribed, Registered, compare_dose, validate, allergy_matches


def test_caso1_dosis_correcta():
    assert compare_dose(D(1), "g", D(1), "g") is None


def test_caso2_1g_vs_45g_critica():
    f = compare_dose(D(1), "g", D(45), "g")
    assert f.tipo == "dosis" and f.bloquea
    assert f.detalle["ratio"] == "45"
    assert "45 veces" in f.mensaje


def test_caso3_500mg_vs_500g_error_unidad():
    f = compare_dose(D(500), "mg", D(500), "g")
    assert f.tipo == "unidad" and f.bloquea
    assert f.detalle["ratio"] == "1000"


def test_caso4_unidad_equivalente():
    assert compare_dose(D(1), "g", D(1000), "mg") is None
    assert compare_dose(D("0.5"), "mg", D(500), "mcg") is None
    assert compare_dose(D(1), "L", D(1000), "mL") is None


def test_masa_vs_volumen_no_equivalentes():
    f = compare_dose(D(500), "mg", D(500), "mL")
    assert f.tipo == "unidad" and f.bloquea


def test_ui_no_se_convierte():
    assert compare_dose(D(1000), "UI", D(1), "g").tipo == "unidad"
    assert compare_dose(D(1000), "UI", D(1000), "UI") is None


def test_decimales_exactos_sin_error_de_flotante():
    assert compare_dose(D("0.1"), "g", D(100), "mg") is None
    assert compare_dose(D("0.3"), "g", D("300.0"), "mg") is None
    assert compare_dose(D("0.25"), "g", D("0.26"), "g").tipo == "dosis"


def test_dosis_menor_reporta_porcentaje():
    f = compare_dose(D(1000), "mg", D(100), "mg")
    assert f.tipo == "dosis" and "10 %" in f.mensaje


def test_diferencias_extremas():
    f = compare_dose(D("0.001"), "mcg", D(1000000000), "g")
    assert f.bloquea


@pytest.mark.parametrize("bad", ["", "  ", None, "abc", "-5", "0", "nan", "inf", "1e400000", "-0.1"])
def test_datos_invalidos(bad):
    with pytest.raises(U.InvalidDose):
        U.to_decimal(bad)


def test_unidad_invalida():
    with pytest.raises(U.InvalidDose):
        U.canon_unit("kg-x")


def test_coma_decimal():
    assert U.to_decimal("0,5") == D("0.5")


def _p(**kw):
    base = dict(medication_id=1, medication_name="Med A", dose=D(1), unit="g", route="IV", version=1,
                status="activa")
    base.update(kw)
    return Prescribed(**base)


def _r(**kw):
    base = dict(medication_id=1, dose=D(1), unit="g", route="IV", patient_document="123", version=1)
    base.update(kw)
    return Registered(**base)


def tipos(fs):
    return {f.tipo for f in fs}


def test_validate_todo_correcto():
    assert validate(_p(), _r(), "123") == []


def test_validate_paciente_incorrecto():
    assert "paciente" in tipos(validate(_p(), _r(patient_document="999"), "123"))


def test_validate_medicamento_via_suspendida_version():
    fs = validate(_p(status="suspendida", version=2), _r(medication_id=2, route="VO"), "123")
    assert {"medicamento", "via", "suspendida", "prescripcion_modificada"} <= tipos(fs)


def test_validate_horario_advertencia_no_bloquea():
    sched = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)
    fs = validate(_p(scheduled_at=sched), _r(at=sched + timedelta(hours=3)), "123")
    assert tipos(fs) == {"horario"} and not any(f.bloquea for f in fs)


def test_alergia():
    assert allergy_matches("Penicilina, látex", "Amoxicilina", "penicilina") == ["penicilina"]
    assert allergy_matches(None, "x", "y") == []
