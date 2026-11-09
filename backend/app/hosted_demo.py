"""Sirve la demostración con los paneles de medicina y enfermería."""
import os
from pathlib import Path

import uvicorn
from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .main import app
from .seed import seed

dist = Path(__file__).resolve().parents[1] / "dist"


def configure_frontend(directory: Path):
    app.mount("/assets", StaticFiles(directory=directory / "assets"), name="assets")

    @app.get("/favicon.svg", include_in_schema=False)
    def favicon():
        return FileResponse(directory / "favicon.svg")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404)
        return FileResponse(directory / "index.html")


if __name__ == "__main__":
    if not (settings.seed_doctor_password and settings.seed_nurse_password):
        raise SystemExit("Configura las contraseñas de Iván y Sofía en el alojamiento.")
    seed(show_passwords=False)
    configure_frontend(dist)
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
