import numpy as np
import logging
from typing import List

logger = logging.getLogger(__name__)

class ONNXEmbedder:
    def __init__(self, model_id="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"):
        self.model_id = model_id
        self._model = None

    @property
    def model(self):
        if self._model is None:
            logger.info(f"Lazy loading embedder for {self.model_id}...")
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_id)
            logger.info("Embedder ready.")
        return self._model

    def embed(self, texts: List[str]) -> np.ndarray:
        if isinstance(texts, str):
            texts = [texts]
        embeddings = self.model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1e-12
        return embeddings / norms
