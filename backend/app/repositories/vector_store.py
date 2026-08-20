import os
import time
import json
import hashlib
import sqlite3
import pickle
import faiss
import numpy as np
import logging
from typing import List, Dict, Any, Tuple
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# Simple in-process embedding cache: query -> embedding (avoids re-encoding repeated queries)
_EMB_CACHE: dict[str, np.ndarray] = {}
_EMB_CACHE_MAX = 256

def _emb_cache_key(query: str) -> str:
    return hashlib.sha256(query.encode()).hexdigest()

class VectorStore:
    def __init__(self, faiss_path: str, bm25_path: str, db_path: str, model_name: str):
        self.faiss_path = faiss_path
        self.bm25_path = bm25_path
        self.db_path = db_path
        
        logger.info(f"Loading Embedding model {model_name}...")
        t0 = time.perf_counter()
        self.model = SentenceTransformer(model_name)
        # Warmup — first encode is ~6x slower (graph compile); do it at startup not on first request
        try:
            self.model.encode(["warmup"], convert_to_numpy=True, show_progress_bar=False)
        except Exception:
            pass
        logger.info(f"Embedding model ready in {(time.perf_counter()-t0)*1000:.0f}ms")
        
        logger.info(f"Loading FAISS index from {faiss_path}...")
        if os.path.exists(faiss_path):
            self.index = faiss.read_index(faiss_path)
            with open(faiss_path + "_mapping.pkl", 'rb') as f:
                self.faiss_mapping = pickle.load(f)
        else:
            self.index = None
            self.faiss_mapping = {}
            logger.warning("FAISS index not found.")

        logger.info(f"Loading BM25 index from {bm25_path}...")
        if os.path.exists(bm25_path):
            with open(bm25_path, 'rb') as f:
                data = pickle.load(f)
                self.bm25 = data["bm25"]
                self.bm25_mapping = data["mapping"]
        else:
            self.bm25 = None
            self.bm25_mapping = {}
            logger.warning("BM25 index not found.")

        # Keep sqlite connection open for fast metadata retrieval
        if os.path.exists(db_path):
            self.conn = sqlite3.connect(db_path, check_same_thread=False)
            # Optimize sqlite for read-heavy workload
            try:
                self.conn.execute("PRAGMA journal_mode=WAL;")
                self.conn.execute("PRAGMA synchronous=NORMAL;")
                self.conn.execute("PRAGMA cache_size=-64000;")
            except Exception:
                pass
        else:
            self.conn = None
            logger.warning("Metadata DB not found.")

    def get_metadata(self, chunk_ids: List[str]) -> List[Dict[str, Any]]:
        if not self.conn or not chunk_ids:
            return []
        cursor = self.conn.cursor()
        placeholders = ','.join('?' for _ in chunk_ids)
        cursor.execute(f"SELECT chunk_id, doc_id, text, metadata FROM chunks WHERE chunk_id IN ({placeholders})", chunk_ids)
        rows = cursor.fetchall()
        
        # Create a dict for easy lookup to maintain order
        row_dict = {row[0]: {"chunk_id": row[0], "doc_id": row[1], "text": row[2], "metadata": json.loads(row[3])} for row in rows}
        return [row_dict.get(cid) for cid in chunk_ids if cid in row_dict]

    def _encode_cached(self, query: str) -> np.ndarray:
        key = _emb_cache_key(query)
        hit = _EMB_CACHE.get(key)
        if hit is not None:
            return hit
        emb = self.model.encode([query], convert_to_numpy=True, show_progress_bar=False)
        # LRU-ish eviction
        if len(_EMB_CACHE) >= _EMB_CACHE_MAX:
            _EMB_CACHE.pop(next(iter(_EMB_CACHE)))
        _EMB_CACHE[key] = emb
        return emb

    def search_dense(self, query: str, top_k: int = 5) -> List[Tuple[str, float]]:
        if not self.index:
            return []
        query_embedding = self._encode_cached(query)
        distances, indices = self.index.search(query_embedding, top_k)
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx != -1 and idx in self.faiss_mapping:
                results.append((self.faiss_mapping[idx], float(dist)))
        return results

    def search_lexical(self, query: str, top_k: int = 5) -> List[Tuple[str, float]]:
        if not self.bm25:
            return []
        tokenized_query = query.lower().split()
        scores = self.bm25.get_scores(tokenized_query)
        top_n = np.argsort(scores)[::-1][:top_k]
        
        results = []
        for idx in top_n:
            score = scores[idx]
            if score > 0 and idx in self.bm25_mapping:
                results.append((self.bm25_mapping[idx], float(score)))
        return results

    def hybrid_search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        # Dense is the bottleneck (embedding ~23ms); lexical is ~1ms
        # Run sequentially but cache embedding; for true parallelism the caller
        # can offload via asyncio.to_thread — here we keep it sync for simplicity
        # and add embedding cache for hot-path.
        dense_results = self.search_dense(query, top_k=top_k*2)
        lexical_results = self.search_lexical(query, top_k=top_k*2)
        
        # RRF
        rrf_scores = {}
        k_rrf = 60
        
        for rank, (chunk_id, _) in enumerate(dense_results):
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0) + 1.0 / (k_rrf + rank + 1)
            
        for rank, (chunk_id, _) in enumerate(lexical_results):
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0) + 1.0 / (k_rrf + rank + 1)
            
        sorted_chunks = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
        top_chunk_ids = [c[0] for c in sorted_chunks]
        
        # Fetch metadata
        metadata = self.get_metadata(top_chunk_ids)
        return metadata

# Global singleton to load once
store_instance = None

def get_store(settings):
    global store_instance
    if store_instance is None:
        store_instance = VectorStore(
            faiss_path=settings.VECTOR_INDEX_PATH,
            bm25_path=settings.BM25_INDEX_PATH,
            db_path=settings.METADATA_DB_PATH,
            model_name=settings.EMBEDDING_MODEL
        )
    return store_instance
