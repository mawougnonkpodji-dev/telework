import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()

_BACKEND_ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Robustesse réseau : pré-ping + recyclage + timeout de connexion
    SQLALCHEMY_ENGINE_OPTIONS = {
        # pool_pre_ping retiré : il ajoutait un SELECT 1 (round-trip réseau)
        # sur chaque connexion sortie du pool. pool_recycle + keepalives suffisent.
        "pool_recycle": 280,          # recycle toutes les ~4 min (< keep-alive Supabase 300 s)
        "pool_size": 10,              # augmenté pour absorber les pics de concurrence
        "max_overflow": 20,
        "pool_timeout": 20,
        "connect_args": {
            "connect_timeout": 10,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
        },
    }
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.getenv("JWT_ACCESS_HOURS", "1")))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "30")))
    JWT_TOKEN_LOCATION = ["headers"]
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", os.path.join(_BACKEND_ROOT, "uploads"))
    MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_DEFAULT = os.getenv("RATELIMIT_DEFAULT", "200 per hour")
    ALLOWED_UPLOAD_EXTENSIONS = {
        ext.strip().lower()
        for ext in os.getenv("ALLOWED_UPLOAD_EXTENSIONS", "pdf,png,jpg,jpeg,webp,txt,doc,docx,xlsx,csv").split(",")
        if ext.strip()
    }
    ALLOWED_UPLOAD_MIME_TYPES = {
        mime.strip().lower()
        for mime in os.getenv(
            "ALLOWED_UPLOAD_MIME_TYPES",
            "application/pdf,image/png,image/jpeg,image/webp,text/plain,"
            "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,"
            "application/vnd.ms-excel,text/csv,"
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ).split(",")
        if mime.strip()
    }
    AI_DAILY_QUOTA_PER_USER_PROJECT = int(os.getenv("AI_DAILY_QUOTA_PER_USER_PROJECT", "50"))
    AI_WEEKLY_SUMMARY_SCHEDULER_ENABLED = os.getenv("AI_WEEKLY_SUMMARY_SCHEDULER_ENABLED", "true").lower() == "true"
    AI_WEEKLY_SUMMARY_CRON_DAY = os.getenv("AI_WEEKLY_SUMMARY_CRON_DAY", "mon")
    AI_WEEKLY_SUMMARY_CRON_HOUR = int(os.getenv("AI_WEEKLY_SUMMARY_CRON_HOUR", "8"))
    AI_WEEKLY_SUMMARY_CRON_MINUTE = int(os.getenv("AI_WEEKLY_SUMMARY_CRON_MINUTE", "0"))
    PAYROLL_MONTHLY_SCHEDULER_ENABLED = os.getenv("PAYROLL_MONTHLY_SCHEDULER_ENABLED", "true").lower() == "true"
    PAYROLL_MONTHLY_CRON_DAY = int(os.getenv("PAYROLL_MONTHLY_CRON_DAY", "1"))
    PAYROLL_MONTHLY_CRON_HOUR = int(os.getenv("PAYROLL_MONTHLY_CRON_HOUR", "1"))
    PAYROLL_MONTHLY_CRON_MINUTE = int(os.getenv("PAYROLL_MONTHLY_CRON_MINUTE", "0"))

    # ── Email (SMTP) ──────────────────────────────────────────────────────────
    MAIL_SERVER   = os.getenv("MAIL_SERVER",   "")        # ex: smtp.gmail.com
    MAIL_PORT     = int(os.getenv("MAIL_PORT", "587"))
    MAIL_USERNAME = os.getenv("MAIL_USERNAME", "")        # adresse expéditeur
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")        # mot de passe / App Password
    MAIL_FROM     = os.getenv("MAIL_FROM",     "")        # optionnel, défaut = MAIL_USERNAME

    # URL du frontend (utilisée dans les liens d'invitation)
    FRONTEND_URL  = os.getenv("FRONTEND_URL",  "http://localhost:5173")

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig
}