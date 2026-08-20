import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    SARVAM_API_KEY: str = ""
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.groq.com/openai/v1"
    LLM_MODEL: str = "llama3-8b-8192"
    
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    
    VECTOR_INDEX_PATH: str = "../data/faiss_index"
    BM25_INDEX_PATH: str = "../data/bm25_index.pkl"
    METADATA_DB_PATH: str = "../data/metadata.sqlite"
    
    CORS_ORIGINS: str = "*"
    MAX_AUDIO_MB: int = 10
    REQUEST_TIMEOUT_MS: int = 5000
    RATE_LIMIT_PER_MINUTE: int = 60
    
    ENVIRONMENT: str = "development"
    ASSISTANT_NAME: str = "Bob"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()
