import numpy as np
import logging
from typing import List
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

class ONNXEmbedder:
    def __init__(self, model_id="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"):
        logger.info(f"Loading native embedder for {model_id}...")
        self.model = SentenceTransformer(model_id) # removed backend="onnx" for stability
        self.model.encode(["warmup"], convert_to_numpy=True, show_progress_bar=False)
        logger.info("Embedder ready.")

    def embed(self, texts: List[str]) -> np.ndarray:
        if isinstance(texts, str):
            texts = [texts]
        embeddings = self.model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        # Normalize for fast cosine similarity via dot product
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings = embeddings / norms
        return embeddings

