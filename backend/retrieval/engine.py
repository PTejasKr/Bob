"""
Bob Retrieval Engine — orchestrates embedder + LanceDB store.

Provides:
- check_guardrails(): keyword-based fast guardrail (no embedding needed)
- retrieve(): hybrid or fast-dense search with parent expansion
- classify_query(): route to FAST (dense-only) or FULL (hybrid) path
"""
import logging
import time
from typing import Dict, List, Optional

from .embedder import ONNXEmbedder
from .store import LanceDBStore

logger = logging.getLogger(__name__)

# Guardrail keywords — deterministic, no embedding overhead
_POLITICS_KEYWORDS = frozenset([
    "president", "election", "political", "vote for", "politician",
    "democrat", "republican", "congress", "parliament", "prime minister",
])
_UNSAFE_KEYWORDS = frozenset([
    "hack", "exploit", "attack", "kill", "bomb", "weapon", "drug",
])
_CHITCHAT_PREFIXES = (
    "hi", "hello", "hey", "what's up", "how are you", "good morning",
    "good evening", "good night", "thanks", "thank you", "bye",
)


class RetrievalEngine:
    def __init__(self, db_path: str = "./data/lancedb"):
        self.embedder = ONNXEmbedder()
        self.store = LanceDBStore(db_path)
        # Complexity classifier words
        self._complex_words = frozenset([
            "compare", "differences", "explain", "why", "how",
            "contrast", "analyze", "describe", "relationship",
        ])

    def initialize(self):
        """Eagerly load models and warm up. Call at app startup."""
        t0 = time.perf_counter()
        self.embedder.initialize()
        # Warm-up query to prime ONNX/LanceDB
        try:
            warmup_vec = self.embedder.embed_single("warmup query")
            if self.store.table is not None:
                self.store.table.search(warmup_vec).limit(1).to_list()
        except Exception as e:
            logger.warning(f"Warm-up query failed (non-fatal): {e}")
        elapsed = int((time.perf_counter() - t0) * 1000)
        logger.info(f"RetrievalEngine initialized in {elapsed}ms")

    def classify_query(self, query: str) -> str:
        """Classify query complexity: FAST (dense-only) or FULL (hybrid)."""
        tokens = query.lower().split()
        if len(tokens) < 5 and not any(w in self._complex_words for w in tokens):
            return "FAST"
        return "FULL"

    def check_guardrails(self, query: str, threshold: float = 0.82) -> Optional[str]:
        """
        Fast keyword-based guardrail check. Returns route name if blocked,
        None if query is allowed through.
        """
        q_lower = query.lower().strip()

        # Chitchat detection
        for prefix in _CHITCHAT_PREFIXES:
            if q_lower.startswith(prefix) and len(q_lower.split()) < 6:
                return "chitchat"

        # Politics / unsafe
        for kw in _POLITICS_KEYWORDS:
            if kw in q_lower:
                return "politics"
        for kw in _UNSAFE_KEYWORDS:
            if kw in q_lower:
                return "unsafe"

        return None

    async def retrieve(self, query_text: str, top_k: int = 3) -> List[Dict]:
        """
        Main retrieval entry point. Routes to fast (dense) or full (hybrid)
        based on query complexity.
        """
        query_vector = self.embedder.embed_single(query_text)
        path = self.classify_query(query_text)

        if path == "FAST":
            return await self.store.fast_search(query_vector, top_k=top_k)
        else:
            return await self.store.hybrid_search(query_text, query_vector, top_k=top_k)
