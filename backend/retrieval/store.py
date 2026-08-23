"""
LanceDB Store — dense search, FTS search, hybrid search with RRF fusion.

Operates on the 'chunks' table with schema:
  child_id, parent_id, doc_id, text, parent_text, metadata, vector
"""
import asyncio
import json
import logging
from typing import Any, Dict, List

import lancedb

logger = logging.getLogger(__name__)

RRF_K = 60  # Reciprocal Rank Fusion constant


def _parse_metadata(raw) -> dict:
    """Safely parse metadata from string or dict."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return {}


def _parent_expand(hits: List[Dict], top_k: int) -> List[Dict]:
    """Deduplicate by parent_id, return parent-level context chunks."""
    seen = set()
    results = []
    for h in hits:
        pid = h.get("parent_id", h.get("child_id", ""))
        if pid in seen:
            continue
        seen.add(pid)
        results.append({
            "chunk_id": pid,
            "doc_id": h.get("doc_id", ""),
            "text": h.get("parent_text", h.get("text", "")),
            "metadata": _parse_metadata(h.get("metadata", "{}")),
        })
        if len(results) >= top_k:
            break
    return results


class LanceDBStore:
    def __init__(self, db_path: str = "./data/lancedb"):
        self.db_path = db_path
        logger.info(f"Connecting to LanceDB at {db_path}...")
        self.db = lancedb.connect(db_path)

        tables = self.db.table_names()
        self.table = None
        self._has_fts = False

        # Find the chunks table
        for name in ("chunks", "vectors"):
            if name in tables:
                self.table = self.db.open_table(name)
                logger.info(f"Opened table '{name}' ({db_path})")
                break
        else:
            if tables:
                self.table = self.db.open_table(tables[0])
                logger.info(f"Opened fallback table '{tables[0]}' ({db_path})")
            else:
                logger.warning(f"No tables found in {db_path}. Available: {tables}")

        # Probe for FTS support
        if self.table is not None:
            try:
                self.table.search("test", query_type="fts").limit(1).to_list()
                self._has_fts = True
                logger.info("FTS index detected and functional")
            except Exception:
                logger.info("FTS index not available — hybrid search will use dense-only")

    # ── Dense search (sync, run in thread) ──────────────────────────
    def _dense(self, query_vector: list, limit: int = 10) -> List[Dict]:
        if self.table is None:
            return []
        try:
            return self.table.search(query_vector).limit(limit).nprobes(8).to_list()
        except Exception as e:
            logger.warning(f"Dense search failed: {e}")
            return []

    # ── FTS search (sync, run in thread) ────────────────────────────
    def _fts(self, query_text: str, limit: int = 10) -> List[Dict]:
        if self.table is None or not self._has_fts:
            return []
        try:
            return self.table.search(query_text, query_type="fts").limit(limit).to_list()
        except Exception as e:
            logger.warning(f"FTS search failed: {e}")
            return []

    # ── Fast path: dense only ──────────────────────────────────────
    async def fast_search(self, query_vector: list, top_k: int = 3) -> List[Dict]:
        hits = await asyncio.to_thread(self._dense, query_vector, top_k * 3)
        return _parent_expand(hits, top_k)

    # ── Full path: dense + FTS → RRF fusion ────────────────────────
    async def hybrid_search(
        self, query_text: str, query_vector: list, top_k: int = 5
    ) -> List[Dict]:
        if self.table is None:
            return []

        candidates = top_k * 3

        # Run dense and FTS concurrently
        dense_hits, fts_hits = await asyncio.gather(
            asyncio.to_thread(self._dense, query_vector, candidates),
            asyncio.to_thread(self._fts, query_text, candidates),
        )

        # RRF fusion
        scores: Dict[str, float] = {}
        chunk_map: Dict[str, Dict] = {}

        for rank, hit in enumerate(dense_hits):
            cid = hit.get("child_id", hit.get("id", str(rank)))
            chunk_map.setdefault(cid, hit)
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)

        for rank, hit in enumerate(fts_hits):
            cid = hit.get("child_id", hit.get("id", str(rank)))
            chunk_map.setdefault(cid, hit)
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)

        # Sort by fused score, then parent-expand
        ranked = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
        ordered_hits = [chunk_map[cid] for cid in ranked]
        return _parent_expand(ordered_hits, top_k)
