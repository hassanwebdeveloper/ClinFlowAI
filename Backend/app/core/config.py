from pydantic_settings import BaseSettings
from typing import Literal, Optional
from functools import lru_cache

class Settings(BaseSettings):
    # API Configuration
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = True

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
    TOGETHER_API_KEY: str = ""
    TOGETHER_WHISPER_MODEL: str = "openai/whisper-large-v3"
    TOGETHER_LLM_MODEL: str = "Qwen/Qwen3-235B-A22B-Instruct-2507-tput"
    TOGETHER_EMBEDDING_MODEL: str = "togethercomputer/m2-bert-80M-8k-retrieval"
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

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings() 