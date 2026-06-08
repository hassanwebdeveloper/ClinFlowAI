from pydantic_settings import BaseSettings
from typing import Literal, Optional
from functools import lru_cache

class Settings(BaseSettings):
    # API Configuration
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = True

    # File-based debug logging (rotating; see app/core/debug_log.py)
    LOG_DIR: str = "logs"
    LOG_FILE_NAME: str = "clinflow-debug.log"
    LOG_LEVEL: str = "INFO"
    LOG_MAX_BYTES: int = 10_000_000
    LOG_BACKUP_COUNT: int = 20

    # MongoDB Configuration
    MONGODB_URL: str
    MONGODB_DB_NAME: str

    # Redis Configuration
    REDIS_HOST: str
    REDIS_PORT: int
    REDIS_DB: int

    # JWT Configuration
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    # Together AI
    TOGETHER_BASE_URL: str = "https://api.together.xyz/v1"
    TOGETHER_API_KEY: str = ""
    TOGETHER_WHISPER_MODEL: str = "openai/whisper-large-v3"
    TOGETHER_LLM_MODEL: str = "Qwen/Qwen3-235B-A22B-Instruct-2507-tput"
    TOGETHER_EMBEDDING_MODEL: str = "intfloat/multilingual-e5-large-instruct"
    # Vision-language model for scanned lab reports / photos (Together chat completions + image_url).
    TOGETHER_VL_MODEL: str = "Qwen/Qwen3.5-9B"

    # Speech-to-text: "together" (Whisper on Together) or "soniox" (async file API)
    TRANSCRIPTION_PROVIDER: Literal["together", "soniox"] = "soniox"
    # If True, STT outputs English (Together: Whisper translate task; Soniox: one-way translation to en).
    TRANSCRIBE_TRANSLATE_TO_ENGLISH: bool = True

    # Soniox async speech-to-text (https://soniox.com/docs/stt/SDKs/python-SDK/async-transcription)
    SONIOX_API_KEY: str = ""
    SONIOX_STT_MODEL: str = "stt-async-v4"
    SONIOX_STT_WAIT_TIMEOUT_SEC: Optional[float] = None

    # Uploads
    UPLOAD_DIR: str = "uploads"

    # SMTP (password reset emails)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "ClinFlowAI <no-reply@clinflowai.com>"
    SMTP_USE_TLS: bool = True
    ACCESS_REQUEST_EMAIL: str = ""
    ACCESS_REQUEST_REVIEW_BASE_URL: str = "/access-requests/review"
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    PASSWORD_RESET_TOKEN_EXPIRE_SECONDS: int = 3600

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings() 