from fastapi import APIRouter
from app.repositories.vector_store import get_store
from app.core.config import settings

router = APIRouter()

@router.get("/health")
def health_check():
    return {"status": "ok"}

@router.get("/ready")
def readiness_check():
    store = get_store(settings)
    if store.index is None or store.bm25 is None:
        return {"status": "not_ready", "detail": "Indexes not loaded"}
    return {"status": "ready"}
