from fastapi import APIRouter
from app.repositories.lancedb_store import get_store
from app.core.config import settings
from app.core.metrics import snapshot

router = APIRouter()


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "assistant": settings.ASSISTANT_NAME,
        "model": settings.LLM_MODEL,
    }


@router.get("/ready")
def readiness_check():
    try:
        store = get_store(settings)
        if store.store.table is None:
            return {"status": "not_ready", "detail": "LanceDB table not loaded"}
    except Exception as e:
        return {"status": "not_ready", "detail": str(e)}

    if not settings.LLM_API_KEY:
        return {"status": "not_ready", "detail": "LLM_API_KEY missing"}

    return {
        "status": "ready",
        "assistant": settings.ASSISTANT_NAME,
        "indexes": "loaded",
    }


@router.get("/metrics")
def metrics_snapshot():
    return snapshot()
