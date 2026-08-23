"""
Fast CPU embedder — ONNX Runtime first, SentenceTransformer fallback.

Target: <5ms single-query encode on CPU via ONNX.
Falls back to PyTorch SentenceTransformer if ONNX export isn't available.
"""
import logging
import time
from pathlib import Path
from typing import List, Optional

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lightweight ONNX path (preferred for serving)
# ---------------------------------------------------------------------------

_onnx_session = None
_tokenizer = None
_USE_ONNX = False


def _try_init_onnx(model_id: str) -> bool:
    """Attempt to load the ONNX model + fast tokenizer. Returns True on success."""
    global _onnx_session, _tokenizer, _USE_ONNX
    try:
        import onnxruntime as ort
        from tokenizers import Tokenizer

        # sentence-transformers models export to ONNX via the onnx/ subfolder
        # or we can export on the fly. Check HF cache first.
        from huggingface_hub import hf_hub_download

        onnx_path = "/app/model_cache/onnx/model.onnx"
        if not Path(onnx_path).exists():
            raise FileNotFoundError(f"Missing ONNX model at {onnx_path}")
            
        logger.info(f"ONNX model found at {onnx_path}")

        sess_opts = ort.SessionOptions()
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_opts.intra_op_num_threads = 2
        sess_opts.inter_op_num_threads = 1

        _onnx_session = ort.InferenceSession(
            onnx_path, sess_options=sess_opts, providers=["CPUExecutionProvider"]
        )
        
        _tokenizer = Tokenizer.from_file("/app/model_cache/tokenizer.json")
        _tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
        _tokenizer.enable_truncation(max_length=128)

        _USE_ONNX = True
        logger.info("ONNX embedder initialized successfully")
        return True
    except Exception as e:
        logger.warning(f"ONNX init failed ({type(e).__name__}: {e}), will use SentenceTransformer")
        return False


def _onnx_encode(texts: List[str]) -> np.ndarray:
    """Encode texts using ONNX runtime — fast path."""
    encodings = _tokenizer.encode_batch(texts)
    
    inputs = {
        "input_ids": np.array([e.ids for e in encodings], dtype=np.int64),
        "attention_mask": np.array([e.attention_mask for e in encodings], dtype=np.int64),
    }
    # Some models also need token_type_ids
    if hasattr(encodings[0], "type_ids") and encodings[0].type_ids:
        inputs["token_type_ids"] = np.array([e.type_ids for e in encodings], dtype=np.int64)

    # Check what the model actually expects
    input_names = {inp.name for inp in _onnx_session.get_inputs()}
    inputs = {k: v for k, v in inputs.items() if k in input_names}

    outputs = _onnx_session.run(None, inputs)

    # Mean pooling over token embeddings (output[0] is token_embeddings)
    token_embeddings = outputs[0]  # shape: (batch, seq_len, hidden_dim)
    mask = inputs["attention_mask"].astype(np.float32)
    mask_expanded = np.expand_dims(mask, axis=-1)  # (batch, seq_len, 1)
    summed = np.sum(token_embeddings * mask_expanded, axis=1)
    counts = np.clip(mask_expanded.sum(axis=1), a_min=1e-9, a_max=None)
    pooled = summed / counts

    # L2 normalize
    norms = np.linalg.norm(pooled, axis=1, keepdims=True)
    norms[norms == 0] = 1e-12
    return pooled / norms


# ---------------------------------------------------------------------------
# SentenceTransformer fallback (used for offline pipeline / ONNX unavailable)
# ---------------------------------------------------------------------------

_st_model = None


def _get_st_model(model_id: str):
    global _st_model
    if _st_model is None:
        from sentence_transformers import SentenceTransformer

        logger.info(f"Loading SentenceTransformer /app/model_cache (fallback)...")
        _st_model = SentenceTransformer("/app/model_cache")
        logger.info("SentenceTransformer ready.")
    return _st_model


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


class ONNXEmbedder:
    """Fast embedder that tries ONNX first, falls back to SentenceTransformer."""

    def __init__(self, model_id: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.model_id = model_id
        self._initialized = False
        import threading
        self._lock = threading.Lock()

    def initialize(self):
        """Eagerly load the model. Call at startup."""
        with self._lock:
            if self._initialized:
                return
            t0 = time.perf_counter()
            if not _try_init_onnx(self.model_id):
                # Force-load the ST model as fallback
                _get_st_model(self.model_id)
            elapsed = int((time.perf_counter() - t0) * 1000)
            logger.info(f"Embedder initialized in {elapsed}ms (onnx={_USE_ONNX})")
            self._initialized = True

    def embed(self, texts: List[str]) -> np.ndarray:
        """Encode texts to normalized vectors. Auto-initializes on first call."""
        if not self._initialized:
            self.initialize()

        if isinstance(texts, str):
            texts = [texts]

        if _USE_ONNX:
            return _onnx_encode(texts)

        model = _get_st_model(self.model_id)
        embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1e-12
        return embeddings / norms

    def embed_single(self, text: str) -> List[float]:
        """Encode a single query string → list of floats (for LanceDB search)."""
        return self.embed([text])[0].tolist()
