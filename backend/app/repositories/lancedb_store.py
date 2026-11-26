"""
Singleton wrapper around RetrievalEngine.

Resolves the LanceDB path for both local dev and Docker layouts:
- Local: <project_root>/data/lancedb
- Docker: /app/data/lancedb
"""
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Ensure the backend directory is on sys.path so `retrieval.engine` resolves
# regardless of whether we're running from backend/ or /app/backend/.
_backend_dir = Path(__file__).resolve().parents[2]
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

_store_instance = None


def _resolve_db_path() -> str:
    """Find the LanceDB directory in known candidate locations."""
    backend_dir = Path(__file__).resolve().parents[2]
    project_root = backend_dir.parent

    candidates = [
        project_root / "data" / "lancedb",          # local dev: hhgoa-rag/data/lancedb
        backend_dir.parent / "data" / "lancedb",     # Docker: /app/data/lancedb
        backend_dir / "data" / "lancedb",            # fallback
        project_root / "data" / "lancedb_optimized",
        backend_dir / "data" / "lancedb_optimized",
    ]

    for cand in candidates:
        if cand.exists() and any(cand.iterdir()):
            logger.info(f"LanceDB path resolved: {cand}")
            return str(cand)

    # Default to first candidate even if it doesn't exist yet
    fallback = str(candidates[0])
    logger.warning(f"No LanceDB data found, defaulting to: {fallback}")
    return fallback


def get_store(settings=None):
    """Get or create the singleton RetrievalEngine."""
    global _store_instance
    if _store_instance is None:
        from retrieval.engine import RetrievalEngine  # noqa: E402
        db_path = _resolve_db_path()
        logger.info(f"Creating RetrievalEngine at {db_path}")
        _store_instance = RetrievalEngine(db_path=db_path)
    return _store_instance


def initialize_store(settings=None):
    """Create the store AND eagerly load models + warm up. Call at app startup."""
    engine = get_store(settings)
    engine.initialize()
    return engine
