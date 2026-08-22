import time
import numpy as np
import logging
from typing import List, Dict
from .embedder import ONNXEmbedder
from .store import LanceDBStore

logger = logging.getLogger(__name__)

class RetrievalEngine:
    def __init__(self, db_path: str = "./data/lancedb"):
        self.embedder = ONNXEmbedder()
        self.store = LanceDBStore(db_path)
        
        # Fast path vs Full path deterministic classifier rules
        self.complex_words = {"compare", "differences", "explain", "why", "how"}
        
        # Guardrail vectors
        self.routes = {
            "politics": [
                "isn't politics the best thing ever",
                "why don't you tell me about your political opinions",
                "don't you just love the president",
                "who is going to win the election",
                "what are your political views",
                "vote for"
            ],
            "chitchat": [
                "how's the weather today?",
                "how are things going?",
                "lovely weather out there",
                "hi",
                "hello",
                "what's up"
            ]
        }
        self.route_embeddings = {}
        for route_name, utterances in self.routes.items():
            emb = self.embedder.embed(utterances)
            self.route_embeddings[route_name] = emb

    def classify_query(self, query: str) -> str:
        tokens = query.lower().split()
        # Fast path deterministic logic
        if len(tokens) < 5 and not any(w in self.complex_words for w in tokens):
            return "FAST"
        return "FULL"

    def check_guardrails(self, query: str, threshold: float = 0.82) -> str:
        t0 = time.perf_counter()
        query_emb = self.embedder.embed([query])
        
        best_match = None
        highest_score = 0.0
        
        for route_name, route_embs in self.route_embeddings.items():
            scores = np.dot(route_embs, query_emb.T).flatten()
            max_score = np.max(scores)
            if max_score > highest_score:
                highest_score = max_score
                if highest_score >= threshold:
                    best_match = route_name
                    
        logger.info(f"Guardrail check took {(time.perf_counter()-t0)*1000:.1f}ms. Route: {best_match}")
        return best_match

    async def retrieve(self, query_text: str, top_k: int = 5) -> List[Dict]:
        query_type = self.classify_query(query_text)
        query_vector = self.embedder.embed([query_text])[0].tolist()
        
        if query_type == "FAST":
            logger.info("Routing query to FAST path (Dense only)")
            return await self.store.fast_search(query_vector, top_k=3)
        else:
            logger.info("Routing query to FULL path (Hybrid + RRF)")
            return await self.store.hybrid_search(query_text, query_vector, top_k=top_k)
