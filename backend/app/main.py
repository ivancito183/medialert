import traceback

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import settings
from .db import engine
from .routers import ai, alerts, auth, nursing, patients, prescriptions, rooms
from .security import csrf_guard

app = FastAPI(title="MediAlert API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["content-type", "x-requested-with"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.update({"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
                         "Referrer-Policy": "no-referrer", "Cache-Control": "no-store",
                         "Permissions-Policy": "camera=(), microphone=(), geolocation=()"})
    return resp


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errs = [{"campo": ".".join(str(x) for x in e["loc"][1:]), "mensaje": str(e["msg"]).replace("Value error, ", "")}
            for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "Datos inválidos", "errores": errs})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    traceback.print_exc()  # detalle solo en el log del servidor, nunca al cliente
    return JSONResponse(status_code=500, content={"detail": "Error interno. Intente nuevamente."})


api = "/api"
guard = [Depends(csrf_guard)]
app.include_router(auth.router, prefix=api, dependencies=guard)
app.include_router(patients.router, prefix=api, dependencies=guard)
app.include_router(rooms.router, prefix=api, dependencies=guard)
app.include_router(prescriptions.router, prefix=api, dependencies=guard)
app.include_router(nursing.router, prefix=api, dependencies=guard)
app.include_router(ai.router, prefix=api, dependencies=guard)
app.include_router(alerts.router, prefix=api, dependencies=guard)


@app.get("/api/health")
def health():
    with engine.connect() as c:
        c.execute(text("select 1"))
    return {"status": "ok", "database": "postgresql"}
