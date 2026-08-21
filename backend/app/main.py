import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import routes_voice, routes_health, routes_text
from app.core.config import settings
from app.repositories.vector_store import get_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing application resources...")
    # Pre-load vector store + warm embedding (first encode is 6x slower)
    get_store(settings)
    logger.info("Primary pipeline ready - retrieval warm, target <200ms hot path")
    yield
    logger.info("Shutting down application...")
    # Close persistent STT client
    try:
        from app.services.sarvam_stt import _client
        if _client is not None and not _client.is_closed:
            await _client.aclose()
    except Exception:
        pass

app = FastAPI(title="Bob - HH Goa 2026 Voice RAG (Primary pipeline <200ms hot)", lifespan=lifespan, version="2.0.0")

# CORS: allow all origins in dev; credentials must be False with wildcard
cors_origins = ["*"] if settings.CORS_ORIGINS == "*" else [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_health.router, tags=["health"])
app.include_router(routes_text.router, prefix="/api/v1/text", tags=["text"])
app.include_router(routes_voice.router, prefix="/api/v1/voice", tags=["voice"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
