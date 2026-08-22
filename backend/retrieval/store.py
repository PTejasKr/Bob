import lancedb
import logging
import json
import os
import asyncio
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class LanceDBStore:
    def __init__(self, db_path: str = "./data/lancedb"):
        self.db_path = db_path
        logger.info(f"Connecting to LanceDB at {db_path}...")
        self.db = lancedb.connect(db_path)
        tables = self.db.table_names()
        self.table_name = "chunks"
        if "chunks" in tables:
            self.table_name = "chunks"
        elif "vectors" in tables:
            self.table_name = "vectors"
        elif len(tables) > 0:
            self.table_name = tables[0]

        self.table = None
        if self.table_name in tables:
            self.table = self.db.open_table(self.table_name)
            logger.info(f"Opened table '{self.table_name}' in {db_path}")
        else:
            logger.warning(f"No suitable table found in {db_path}. Available tables: {tables}")


    def rrf_score(self, rank, k=60):
        return 1.0 / (k + rank)

    async def _search_dense(self, query_vector: list, limit: int = 10) -> List[Dict]:
        if self.table is None:
            return []
        return await asyncio.to_thread(
            lambda: self.table.search(query_vector).limit(limit).to_list()
        )

    async def _search_fts(self, query_text: str, limit: int = 10) -> List[Dict]:
        if self.table is None:
            return []
        try:
            # For LanceDB FTS queries
            return await asyncio.to_thread(
                lambda: self.table.search(query_text, query_type="fts").limit(limit).to_list()
            )
        except Exception as e:
            logger.warning(f"FTS search failed: {e}")
            return []

    async def hybrid_search(self, query_text: str, query_vector: list, top_k: int = 5) -> List[Dict]:
        if self.table is None:
            return []

        # Concurrent Dense and FTS
        dense_results, fts_results = await asyncio.gather(
            self._search_dense(query_vector, 10),
            self._search_fts(query_text, 10)
        )

        # RRF Fusion
        scores = {}
        chunks_map = {}
        
        for rank, r in enumerate(dense_results):
            cid = r.get("child_id", r.get("id", str(rank)))
            chunks_map[cid] = r
            scores[cid] = scores.get(cid, 0.0) + self.rrf_score(rank)
            
        for rank, r in enumerate(fts_results):
            cid = r.get("child_id", r.get("id", str(rank)))
            chunks_map[cid] = r
            scores[cid] = scores.get(cid, 0.0) + self.rrf_score(rank)

        sorted_chunks = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
        
        # Parent Context Expansion & Deduplication
        unique_parents = []
        contexts = []
        
        for cid in sorted_chunks:
            c = chunks_map[cid]
            pid = c.get("parent_id", c.get("child_id", cid))
            if pid not in unique_parents:
                unique_parents.append(pid)
                
                raw_meta = c.get("metadata", "{}")
                if isinstance(raw_meta, str):
                    try:
                        metadata = json.loads(raw_meta)
                    except Exception:
                        metadata = {}
                elif isinstance(raw_meta, dict):
                    metadata = raw_meta
                else:
                    metadata = {}
                
                contexts.append({
                    "chunk_id": pid,  # Parent ID as the context reference
                    "doc_id": c.get("doc_id", ""),
                    "text": c.get("parent_text", c.get("text", "")),
                    "metadata": metadata
                })
            if len(unique_parents) >= top_k:
                break
                
        return contexts

    async def fast_search(self, query_vector: list, top_k: int = 3) -> List[Dict]:
        # Fast path: dense only
        dense_results = await self._search_dense(query_vector, limit=top_k*2)
        unique_parents = []
        contexts = []
        
        for idx, r in enumerate(dense_results):
            pid = r.get("parent_id", r.get("child_id", str(idx)))
            if pid not in unique_parents:
                unique_parents.append(pid)
                raw_meta = r.get("metadata", "{}")
                if isinstance(raw_meta, str):
                    try:
                        metadata = json.loads(raw_meta)
                    except Exception:
                        metadata = {}
                elif isinstance(raw_meta, dict):
                    metadata = raw_meta
                else:
                    metadata = {}
                contexts.append({
                    "chunk_id": pid,
                    "doc_id": r.get("doc_id", ""),
                    "text": r.get("parent_text", r.get("text", "")),
                    "metadata": metadata
                })
            if len(unique_parents) >= top_k:
                break
                
        return contexts

