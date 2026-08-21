from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the data root for both the repository layout and the Docker layout.
# Locally this file is backend/app/core/config.py; in Docker it is /app/app/core/config.py.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_PROJECT_ROOT = _BACKEND_DIR.parent
if (_BACKEND_DIR / "data").exists() and not (_PROJECT_ROOT / "data").exists():
    _PROJECT_ROOT = _BACKEND_DIR
_ENV_FILE = _PROJECT_ROOT / ".env"

class Settings(BaseSettings):
    SARVAM_API_KEY: str = ""
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.groq.com/openai/v1"
    LLM_MODEL: str = "groq/compound-mini"
    
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    
    VECTOR_INDEX_PATH: str = str(_PROJECT_ROOT / "data" / "faiss_index")
    BM25_INDEX_PATH: str = str(_PROJECT_ROOT / "data" / "bm25_index.pkl")
    METADATA_DB_PATH: str = str(_PROJECT_ROOT / "data" / "metadata.sqlite")
    
    CORS_ORIGINS: str = "*"
    MAX_AUDIO_MB: int = 10
    REQUEST_TIMEOUT_MS: int = 5000
    RATE_LIMIT_PER_MINUTE: int = 60
    
    ENVIRONMENT: str = "development"
    ASSISTANT_NAME: str = "Bob"

    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    def model_post_init(self, __context):
        # Resolve relative data paths against project root (env may contain ./data/...)
        for field in ("VECTOR_INDEX_PATH", "BM25_INDEX_PATH", "METADATA_DB_PATH"):
            val = getattr(self, field)
            if val and not Path(val).is_absolute():
                cleaned = val.lstrip("./").lstrip(".\\")
                candidates = (_PROJECT_ROOT / cleaned, Path.cwd() / cleaned)
                resolved = next((candidate for candidate in candidates if candidate.exists()), candidates[0])
                setattr(self, field, str(resolved))

settings = Settings()
