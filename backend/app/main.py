import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import routes_voice, routes_health, routes_text, routes_metrics
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup: eagerly load embedder + LanceDB ──
    t0 = time.perf_counter()
    logger.info("Initializing retrieval engine (embedder + LanceDB)...")
    def _init_bg():
        try:
            from app.repositories.lancedb_store import initialize_store
            initialize_store(settings)
            elapsed = int((time.perf_counter() - t0) * 1000)
            logger.info(f"Retrieval engine ready in {elapsed}ms")
        except Exception as e:
            logger.error(f"Retrieval engine init failed: {e}", exc_info=True)

    import threading
    threading.Thread(target=_init_bg, daemon=True).start()

    logger.info("Application startup complete.")
    yield

    # ── Shutdown ──
    logger.info("Shutting down application...")
    try:
        from app.services.sarvam_stt import _client
        if _client is not None and not _client.is_closed:
            await _client.aclose()
    except Exception:
        pass


app = FastAPI(
    title="Bob - HH Goa 2026 Voice RAG",
    lifespan=lifespan,
    version="2.0.0",
)

# CORS setup
cors_origins = (
    ["*"]
    if settings.CORS_ORIGINS == "*"
    else [o.strip() for o in settings.CORS_ORIGINS.split(",")]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_health.router, tags=["health"])
app.include_router(routes_metrics.router, prefix="/api/v1", tags=["metrics"])
app.include_router(routes_text.router, prefix="/api/v1/text", tags=["text"])
app.include_router(routes_voice.router, prefix="/api/v1/voice", tags=["voice"])

# ── Serve frontend static files (built by Vite) ──
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    # Serve favicon and other static files at root
    for static_file in ("favicon.svg", "favicon.ico"):
        sf = frontend_dist / static_file
        if sf.exists():
            @app.get(f"/{static_file}")
            async def serve_static(path=sf):
                return FileResponse(path)

    frontend_dist_resolved = frontend_dist.resolve()

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = (frontend_dist_resolved / full_path).resolve()
        if file_path.is_relative_to(frontend_dist_resolved) and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist_resolved / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
