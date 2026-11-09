"""Asistente IA (Gemini): EXPLICA hallazgos y responde dudas educativas.

Reglas de diseño:
- La decisión de alertar/bloquear es del motor determinístico; la IA nunca la modifica.
- Se envía a Gemini únicamente información desidentificada (medicamento, dosis, tipo de hallazgo).
- Sin clave configurada o ante un fallo, se devuelve la explicación determinística del motor.
"""
import time
from collections import defaultdict, deque

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Alert, User
from ..security import current_user
from ..services import audit
from .alerts import _scope_alerts

router = APIRouter(prefix="/ai")
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
SYSTEM = ("Eres el asistente educativo de MediAlert para personal y estudiantes de enfermería en Colombia. "
          "Responde en español, de forma breve y clara (máximo 180 palabras). Explica riesgos y buenas prácticas de "
          "verificación (los '10 correctos'). NO ordenes ni modifiques dosis, NO sustituyas el criterio médico ni el "
          "protocolo institucional; ante dudas recomienda verificar con el médico o el químico farmacéutico. "
          "Si la pregunta incluye datos personales de un paciente, indica que no deben compartirse.")
_calls: dict[int, deque] = defaultdict(deque)


class AskIn(BaseModel):
    pregunta: str = Field(min_length=3, max_length=800)
    medicamento: str | None = Field(None, max_length=120)


def _limit(uid: int):
    q, t = _calls[uid], time.time()
    while q and t - q[0] > 60:
        q.popleft()
    if len(q) >= 10:
        raise HTTPException(429, "Demasiadas consultas al asistente. Espere un minuto.")
    q.append(t)


def _gemini(prompt: str) -> str | None:
    if not settings.gemini_api_key:
        return None
    try:
        r = httpx.post(URL.format(model=settings.gemini_model), timeout=20,
                       headers={"x-goog-api-key": settings.gemini_api_key},
                       json={"systemInstruction": {"parts": [{"text": SYSTEM}]},
                             "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                             "generationConfig": {"temperature": 0.3, "maxOutputTokens": 600}})
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return None  # nunca exponer detalles del proveedor al cliente


def _answer(prompt: str, fallback: str) -> dict:
    text = _gemini(prompt)
    if text:
        return {"respuesta": text, "fuente": "gemini",
                "aviso": "Explicación generada por IA con fines educativos. No sustituye el criterio clínico."}
    motivo = "IA no configurada" if not settings.gemini_api_key else "IA no disponible en este momento"
    return {"respuesta": fallback, "fuente": "reglas", "aviso": f"{motivo}: se muestra la explicación del motor de reglas."}


@router.get("/status")
def status(user: User = Depends(current_user)):
    return {"gemini_configurado": bool(settings.gemini_api_key)}


@router.post("/ask")
def ask(data: AskIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _limit(user.id)
    ctx = f"Medicamento de interés: {data.medicamento}.\n" if data.medicamento else ""
    out = _answer(ctx + "Pregunta: " + data.pregunta,
                  "El asistente de IA no está disponible. Consulte la ficha farmacológica del medicamento y el protocolo institucional.")
    audit(db, user, "consulta_ia", "ai", None, {"fuente": out["fuente"], "medicamento": data.medicamento})
    db.commit()
    return out


@router.post("/explain-alert/{aid}")
def explain_alert(aid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _limit(user.id)
    a = db.scalars(_scope_alerts(user).where(Alert.id == aid)).first()
    if not a:
        raise HTTPException(404, "Alerta no encontrada")
    # Solo datos desidentificados: sin nombre, documento, habitación ni cama
    prompt = (f"El sistema de verificación detectó un hallazgo de tipo '{a.tipo}' (severidad {a.severidad}) "
              f"con el medicamento {a.medicamento}. Dosis prescrita: {a.dosis_prescrita or 'n/d'}. "
              f"Dosis registrada: {a.dosis_registrada or 'n/d'}. \n"
              "Explica al personal de enfermería por qué esto puede ser un riesgo y qué debe verificar antes de continuar.")
    out = _answer(prompt, a.mensaje + " Verifique la orden médica, la identidad del paciente y solicite revisión médica "
                                     "antes de continuar.")
    audit(db, user, "explicar_alerta_ia", "alert", a.id, {"fuente": out["fuente"]})
    db.commit()
    return out
