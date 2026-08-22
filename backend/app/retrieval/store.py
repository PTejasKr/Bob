"""Bob Retrieval Store (Wave 2) — concurrent hybrid search over LanceDB.

- Dense: IVF_HNSW_SQ cosine on child vectors
- Lexical: LanceDB native FTS (BM25)
- Fusion: Reciprocal Rank Fusion (k=60), computed locally, zero LLM overhead
- Expansion: child hits -> precomputed parent context
"""
import asyncio
import json
import logging
from pathlib import Path
from typing import Any, Dict, List

import lancedb

logger = logging.getLogger(__name__)

RRF_K = 60


class HybridStore:
    def __init__(self, db_path: str, embed_model):
        self.db = lancedb.connect(db_path)
        self.table = self.db.open_table("chunks")
        self.model = embed_model  # shared SentenceTransformer (already warm)

    # ---------- primitive searches (sync, run in threads) ----------
    def _dense(self, query_vec, limit: int) -> List[Dict[str, Any]]:
        try:
            res = (self.table.search(query_vec)
                   .limit(limit).nprobes(8)
                   .select(["child_id", "parent_id", "doc_id", "text",
                            "parent_text", "metadata"])
                   .to_list())
        except Exception as e:
            logger.warning(f"dense search failed: {e}")
            return []
        return [{"child_id": r["child_id"], "parent_id": r["parent_id"],
                 "score": float(r.get("_distance", 0.0)), **r} for r in res]

    def _fts(self, query: str, limit: int) -> List[Dict[str, Any]]:
        try:
            res = (self.table.search(query, query_type="fts")
                   .limit(limit)
                   .select(["child_id", "parent_id", "doc_id", "text",
                            "parent_text", "metadata"])
                   .to_list())
        except Exception as e:
            logger.warning(f"fts search failed: {e}")
            return []
        return [{"child_id": r["child_id"], "parent_id": r["parent_id"],
                 "score": float(r.get("_score", 0.0)), **r} for r in res]

    def encode_query(self, query: str):
        return self.model.encode([query], convert_to_numpy=True,
                                 show_progress_bar=False)[0].tolist()

    # ---------- public async API ----------
    async def hybrid(self, query: str, top_k: int = 5,
                     candidates: int = 10) -> List[Dict[str, Any]]:
        """Dense + FTS concurrently -> RRF fuse children -> expand to parents."""
        qvec = await asyncio.to_thread(self.encode_query, query)
        dense_res, fts_res = await asyncio.gather(
            asyncio.to_thread(self._dense, qvec, candidates),
            asyncio.to_thread(self._fts, query, candidates),
        )

        rrf: Dict[str, Dict[str, Any]] = {}
        for rank, hit in enumerate(dense_res):
            cid = hit["child_id"]
            e = rrf.setdefault(cid, {"hit": hit, "score": 0.0})
            e["score"] += 1.0 / (RRF_K + rank + 1)
        for rank, hit in enumerate(fts_res):
            cid = hit["child_id"]
            e = rrf.setdefault(cid, {"hit": hit, "score": 0.0})
            e["score"] += 1.0 / (RRF_K + rank + 1)

        fused = sorted(rrf.values(), key=lambda x: x["score"], reverse=True)

        # Parent expansion — dedupe parents, keep best child evidence
        parents: Dict[str, Dict[str, Any]] = {}
        for e in fused[:candidates]:
            h = e["hit"]
            pid = h["parent_id"]
            if pid not in parents:
                try:
                    meta = json.loads(h.get("metadata") or "{}")
                except Exception:
                    meta = {}
                parents[pid] = {
                    "chunk_id": pid,
                    "parent_id": pid,
                    "doc_id": h["doc_id"],
                    "text": h["parent_text"],
                    "evidence_child": h["text"],
                    "rrf_score": round(e["score"], 6),
                    "metadata": meta,
                }
            if len(parents) >= top_k:
                break
        return list(parents.values())

    async def fast_dense(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Fast path: dense-only, no FTS thread hop."""
        qvec = await asyncio.to_thread(self.encode_query, query)
        hits = await asyncio.to_thread(self._dense, qvec, top_k)
        seen, out = set(), []
        for h in hits:
            pid = h["parent_id"]
            if pid in seen:
                continue
            seen.add(pid)
            try:
                meta = json.loads(h.get("metadata") or "{}")
            except Exception:
                meta = {}
            out.append({"chunk_id": pid, "doc_id": h["doc_id"],
                        "text": h["parent_text"], "metadata": meta})
        return out
