import json
import hashlib
import logging
from typing import List
from groq import AsyncGroq
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are {assistant_name}, a snappy, fast retrieval-augmented QA assistant.
Rules: Use ONLY the RETRIEVED CONTEXT. Answer as concisely as possible (1-2 sentences). Do not apologize. Do not output anything extra. Just answer the question directly based on the context."""

_client: AsyncGroq | None = None

def _resolve_model(name: str) -> str:
    remap = {
        "llama3-8b-8192": "openai/gpt-oss-20b",
        "llama-3.1-8b-instant": "openai/gpt-oss-20b",
        "groq/compound-mini": "groq/compound-mini",
        "groq/compound": "groq/compound",
        "qwen/qwen3.6-27b": "qwen/qwen3.6-27b",
        "openai/gpt-oss-20b": "openai/gpt-oss-20b",
    }
    return remap.get(name, "groq/compound-mini")


def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=settings.LLM_API_KEY or "dummy_key")
    return _client

_CACHE: dict[str, dict] = {}
_CACHE_ORDER: list[str] = []
_CACHE_MAX = 128

def _cache_key(query: str, chunks: list) -> str:
    h = hashlib.sha256()
    h.update(query.encode())
    for c in chunks:
        h.update(c.get("chunk_id", "").encode())
    return h.hexdigest()

_MAX_CHARS_PER_CHUNK = 420

async def generate_answer(query: str, retrieved_context: list) -> dict:
    ck = _cache_key(query, retrieved_context)
    if ck in _CACHE:
        return _CACHE[ck]

    context_parts = []
    for ctx in retrieved_context:
        txt = ctx.get("text", "")
        if len(txt) > _MAX_CHARS_PER_CHUNK:
            txt = txt[:_MAX_CHARS_PER_CHUNK] + "..."
        context_parts.append(f"[{ctx.get('chunk_id','')}] {txt}")
    context_str = "\n".join(context_parts)

    if not settings.LLM_API_KEY:
        # Fallback snippet if API key is not configured
        snippet = context_parts[0] if context_parts else "No relevant context found."
        return {
            "answer": f"Based on retrieved context: {snippet}",
            "citations": [],
            "grounded": len(context_parts) > 0,
            "confidence": 0.5
        }


    system_content = SYSTEM_PROMPT.format(assistant_name=settings.ASSISTANT_NAME)
    user_content = f"Q: {query}\nCTX:\n{context_str}"

    try:
        client = _get_client()
        model_name = _resolve_model(settings.LLM_MODEL)
        
        # Pure fast completion, no structured output overhead
        resp = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_content}
            ],
            temperature=0.0,
            max_tokens=128, # Shorter max tokens for faster TTFT and generation
        )
        
        answer_text = resp.choices[0].message.content.strip()
        
        result = {
            "answer": answer_text,
            "citations": [], # Fast path, no citations
            "grounded": True, # Assume grounded if it used context
            "confidence": 0.9
        }
        
        # Cache
        if len(_CACHE) >= _CACHE_MAX:
            oldest = _CACHE_ORDER.pop(0)
            _CACHE.pop(oldest, None)
        _CACHE[ck] = result
        _CACHE_ORDER.append(ck)
        
        return result
    except Exception as e:
        logger.error(f"Generation error: {type(e).__name__}: {e}")
        return {
            "answer": "I am unable to answer at this time due to an error.",
            "citations": [],
            "grounded": False,
            "confidence": 0.0
        }
