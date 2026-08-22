from retrieval.engine import RetrievalEngine
import logging

logger = logging.getLogger(__name__)

store_instance = None

def get_store(settings):
    global store_instance
    if store_instance is None:
        from pathlib import Path
        db_path = str(Path(__file__).resolve().parents[3] / "data" / "lancedb_optimized")
        store_instance = RetrievalEngine(db_path=db_path)
    return store_instance

