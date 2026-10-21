"""Application settings and configuration loaded from environment variables."""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration for Sanjeevani Lekh backend."""

    # Server binding (strictly local for clinical privacy)
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # Ollama settings
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    LLM_MODEL: str = "minimax-m3.1-flash:cloud"
    LLM_TEMPERATURE: float = 0.0
    LLM_NUM_CTX: int = 4096
    LLM_KEEP_ALIVE: str = "30m"
    LLM_SEED: int = 42

    # Prompt versioning
    ACTIVE_PROMPT_VERSION: str = "extract-v1.0"

    # Base filesystem paths
    APP_DIR: Path = Path(__file__).resolve().parent
    BACKEND_DIR: Path = APP_DIR.parent
    ROOT_DIR: Path = BACKEND_DIR.parent
    PROMPTS_DIR: Path = BACKEND_DIR / "prompts"
    DATA_DIR: Path = BACKEND_DIR / "data"

    # Database
    DATABASE_PATH: Path = BACKEND_DIR / "field_to_record.db"

    # Speech and OCR settings
    WHISPER_MODEL: str = "ggml-small.en"
    WHISPER_CLI_PATH: Path = ROOT_DIR / "whisper.cpp" / "build" / "bin" / "whisper-cli"
    WHISPER_MODEL_PATH: Path = ROOT_DIR / "models" / "ggml-small.en.bin"
    WHISPER_HINT_PROMPT_VERSION: str = "whisper-hint-v1.0"
    OCR_ENGINE: str = "trocr"
    TROCR_MODEL_NAME: str = "microsoft/trocr-base-handwritten"
    TROCR_DEVICE: str = "cpu"
    USE_TROCR: bool = True

    # Clinical NER & Representation (n2c2 & MIMIC-III)
    ENABLE_CLINICAL_NER: bool = True
    N2C2_MODEL_NAME: str = "samrawal/bert-base-uncased_clinical-ner"
    MIMIC_MODEL_NAME: str = "emilyalsentzer/Bio_ClinicalBERT"

    # Cloud sync settings (Supabase)
    DEVICE_ID: str = "device-ambulance-01"
    SUPABASE_URL: str | None = None
    SUPABASE_KEY: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
