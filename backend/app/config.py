"""Configuración leída del entorno (.env). No contiene secretos."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://medialert:CAMBIAR@localhost:5432/medialert"
    secret_key: str = "cambiar-en-.env"
    session_hours: int = 8
    cookie_secure: bool = False  # True detrás de HTTPS
    cors_origins: str = "http://localhost:5173"
    max_failed_logins: int = 5
    lockout_minutes: int = 15
    seed_doctor_password: str = ""
    seed_nurse_password: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-flash-lite"
    # Reglas del motor (configurables; validar con farmacia/dirección médica)
    dose_tolerance_pct: float = 0.0
    schedule_window_minutes: int = 60
    hospital_tz_offset_hours: int = -5  # America/Bogota, sin horario de verano


settings = Settings()
