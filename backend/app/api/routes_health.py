from fastapi import APIRouter
from app.repositories.vector_store import get_store
from app.core.config import settings

router = APIRouter()

@router.get("/health")
def health_check():
    return {"status": "ok", "assistant": settings.ASSISTANT_NAME, "model": settings.LLM_MODEL}

@router.get("/ready")
def readiness_check():
    store = get_store(settings)
    if store.index is None or store.bm25 is None:
        return {"status": "not_ready", "detail": "Indexes not loaded"}
    # Verify Bob identity + keys present (don't leak values)
    if not settings.SARVAM_API_KEY or not settings.LLM_API_KEY:
        return {"status": "not_ready", "detail": "API keys missing"}
    return {"status": "ready", "assistant": settings.ASSISTANT_NAME, "indexes": "loaded"}
