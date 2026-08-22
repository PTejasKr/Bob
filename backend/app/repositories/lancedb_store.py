from retrieval.engine import RetrievalEngine
import logging

logger = logging.getLogger(__name__)

store_instance = None

def get_store(settings):
    global store_instance
    if store_instance is None:
        from pathlib import Path
        backend_dir = Path(__file__).resolve().parents[2]
        project_root = backend_dir.parent
        workspace_root = project_root.parent
        candidates = [
            workspace_root / "data" / "lancedb",
            backend_dir / "data" / "lancedb_optimized",
            project_root / "data" / "lancedb",
            project_root / "data" / "lancedb_optimized",
            backend_dir / "data" / "lancedb",
        ]
        resolved_db_path = str(candidates[0])
        for cand in candidates:
            if cand.exists():
                resolved_db_path = str(cand)
                break

        logger.info(f"Connecting RetrievalEngine to LanceDB at {resolved_db_path}")
        store_instance = RetrievalEngine(db_path=resolved_db_path)
    return store_instance


