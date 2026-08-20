import json
import hashlib
import logging
from functools import lru_cache
from groq import AsyncGroq
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are {assistant_name}, a retrieval-augmented QA assistant.
Rules: Use ONLY the RETRIEVED CONTEXT. Answer concisely (2-4 sentences). Every claim must be grounded in context. If insufficient, say so. Output JSON only, no markdown.

OUTPUT SCHEMA:
{{"answer":"string","citations":[{{"chunk_id":"string","support":"string"}}],"grounded":true,"confidence":0.0}}
"""

# Lazy client — avoids import-time failure if key not yet loaded
_client: AsyncGroq | None = None

_MODEL_REMAP = {
    "llama3-8b-8192": "groq/compound-mini",
    "llama-3.1-8b-instant": "groq/compound-mini",
    "llama3-70b-8192": "groq/compound",
}

def _resolve_model(name: str) -> str:
    return _MODEL_REMAP.get(name, name)

def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=settings.LLM_API_KEY)
    return _client

# In-memory LRU cache for hot-path <200ms on repeated queries
_CACHE: dict[str, dict] = {}
_CACHE_ORDER: list[str] = []
_CACHE_MAX = 128

def _cache_key(query: str, chunks: list) -> str:
    h = hashlib.sha256()
    h.update(query.encode())
    for c in chunks:
        h.update(c.get("chunk_id", "").encode())
    return h.hexdigest()

def _cache_get(key: str) -> dict | None:
    return _CACHE.get(key)

def _cache_set(key: str, value: dict):
    if key in _CACHE:
        return
    if len(_CACHE) >= _CACHE_MAX:
        oldest = _CACHE_ORDER.pop(0)
        _CACHE.pop(oldest, None)
    _CACHE[key] = value
    _CACHE_ORDER.append(key)

# Trim each chunk to ~400 chars (~100 tokens) to cut prompt from ~900 -> ~300 tokens
_MAX_CHARS_PER_CHUNK = 420

async def generate_answer(query: str, retrieved_context: list) -> dict:
    ck = _cache_key(query, retrieved_context)
    cached = _cache_get(ck)
    if cached is not None:
        return cached

    # Build compact context
    context_parts = []
    for ctx in retrieved_context:
        txt = ctx.get("text", "")
        if len(txt) > _MAX_CHARS_PER_CHUNK:
            txt = txt[:_MAX_CHARS_PER_CHUNK] + "…"
        context_parts.append(f"[{ctx.get('chunk_id','')}] {txt}")
    context_str = "\n".join(context_parts)

    system_content = SYSTEM_PROMPT.format(assistant_name=settings.ASSISTANT_NAME)
    user_content = f"Q: {query}\nCTX:\n{context_str}"

    try:
        client = _get_client()
        model_name = _resolve_model(settings.LLM_MODEL)
        completion = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_content}
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=180,
        )
        response_text = completion.choices[0].message.content
        result = json.loads(response_text)
        _cache_set(ck, result)
        return result
    except Exception as e:
        logger.error(f"Generation error: {type(e).__name__}: {e}")
        return {
            "answer": "I am unable to answer at this time due to an error.",
            "citations": [],
            "grounded": False,
            "confidence": 0.0
        }
