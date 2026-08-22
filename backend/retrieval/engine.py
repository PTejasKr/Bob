from typing import List, Dict
import time
import numpy as np
import logging
from .embedder import ONNXEmbedder
from .store import LanceDBStore

logger = logging.getLogger(__name__)

class RetrievalEngine:
    """
    Sub-50ms multilingual retrieval engine wrapping LanceDB and pySBD chunking.
    """
    def __init__(self, db_path: str = "./data/lancedb_optimized"):
        # For backward compatibility with /ready route
        self.index = True
        self.bm25 = True
        
        self.embedder = ONNXEmbedder()
        self.store = LanceDBStore(db_path)
        
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

    def retrieve(self, query_text: str, lang: str = "en", top_k: int = 3) -> List[Dict]:
        query_vector = self.embedder.embed([query_text])[0]
        results = self.store.search(query_vector.tolist(), lang=lang, top_k=top_k)
        return results

    def search(self, query: str, top_k: int = 3) -> List[Dict]:
        # Alias for backward compatibility
        return self.retrieve(query, lang="hi", top_k=top_k)
        
    def hybrid_search(self, query: str, top_k: int = 3) -> List[Dict]:
        return self.search(query, top_k=top_k)

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
                    
        logger.info(f"Guardrail check took {(time.perf_counter()-t0)*1000:.1f}ms. Route: {best_match} (Score: {highest_score:.2f})")
        return best_match

