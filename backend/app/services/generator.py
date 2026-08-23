"""
LLM answer generator — Groq LPU for ultra-fast inference.

Generates concise answers grounded in retrieved context.
Includes response caching and citation extraction.
"""
import hashlib
import logging
from groq import AsyncGroq
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Answer directly using the supplied context.
Do not explain your reasoning.
Do not repeat the question.
If the context does not contain the answer, say "I don't know."""

_client: AsyncGroq | None = None

def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        import httpx
        # Connection pooling and keep-alive
        http_client = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=50, max_connections=100),
            timeout=httpx.Timeout(15.0, connect=2.0)
        )
        _client = AsyncGroq(api_key=settings.LLM_API_KEY or "dummy_key", http_client=http_client)
    return _client

# Simple LRU cache for normalized queries
_CACHE: dict[str, dict] = {}
_CACHE_ORDER: list[str] = []
_CACHE_MAX = 512

def _normalize_query(query: str) -> str:
    import re
    q = query.lower().strip()
    q = re.sub(r'[^\w\s]', '', q) # remove punctuation
    q = re.sub(r'\s+', ' ', q) # normalize whitespace
    return q

def _cache_key(query: str) -> str:
    q = _normalize_query(query)
    h = hashlib.sha256()
    h.update(q.encode())
    return h.hexdigest()

_MAX_CHARS_PER_CHUNK = 250

def _build_context(retrieved_context: list):
    # Take only top 3 chunks
    top_chunks = retrieved_context[:3]
    context_parts = []
    citations = []
    for i, ctx in enumerate(top_chunks):
        txt = ctx.get("text", "")
        if len(txt) > _MAX_CHARS_PER_CHUNK:
            txt = txt[:_MAX_CHARS_PER_CHUNK] + "..."
        context_parts.append(f"[chunk {i+1}]\n{txt}")
        citations.append({"chunk_id": ctx.get("chunk_id", ""), "support": txt[:100]})
    
    return "\n\n".join(context_parts), citations

async def generate_answer(query: str, retrieved_context: list) -> dict:
    ck = _cache_key(query)
    if ck in _CACHE:
        return _CACHE[ck]

    context_str, citations = _build_context(retrieved_context)

    system_content = SYSTEM_PROMPT
    user_content = f"Question:\n{query}\n\nContext:\n{context_str}"

    if not settings.LLM_API_KEY:
        snippet = citations[0]["support"] if citations else "No relevant context found."
        ans = f"Based on context: {snippet}"
        res = {"answer": ans, "citations": citations, "grounded": True, "confidence": 0.5}
        _CACHE[ck] = res
        return res

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="groq/compound-mini",
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_content},
            ],
            temperature=0.0,
            max_tokens=150,
        )
        answer_text = resp.choices[0].message.content.strip()
        
        ungrounded = ["i don't know", "i do not know", "cannot answer"]
        is_grounded = not any(p in answer_text.lower() for p in ungrounded)

        result = {
            "answer": answer_text,
            "citations": citations,
            "grounded": is_grounded,
            "confidence": 0.95 if is_grounded else 0.2,
        }

        if len(_CACHE) >= _CACHE_MAX:
            oldest = _CACHE_ORDER.pop(0)
            _CACHE.pop(oldest, None)
        _CACHE[ck] = result
        _CACHE_ORDER.append(ck)

        return result
    except Exception as e:
        logger.error(f"Generation error: {type(e).__name__}: {e}")
        return {"answer": "Error.", "citations": [], "grounded": False, "confidence": 0.0}

async def generate_answer_stream(query: str, retrieved_context: list):
    """Generate an answer via Groq LLM and yield streaming tokens."""
    ck = _cache_key(query)
    # If in cache, we just yield the cached answer as a single chunk
    if ck in _CACHE:
        yield _CACHE[ck]["answer"]
        return

    context_str, citations = _build_context(retrieved_context)

    system_content = SYSTEM_PROMPT
    user_content = f"Question:\n{query}\n\nContext:\n{context_str}"

    if not settings.LLM_API_KEY:
        snippet = citations[0]["support"] if citations else "No relevant context found."
        ans = f"Based on context: {snippet}"
        _CACHE[ck] = {"answer": ans, "citations": citations}
        yield ans
        return

    try:
        client = _get_client()
        model_name = "groq/compound-mini"

        stream = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_content},
            ],
            temperature=0.0,
            max_tokens=150,
            stream=True,
        )

        full_answer = []
        async for chunk in stream:
            token = chunk.choices[0].delta.content
            if token:
                full_answer.append(token)
                yield token
        
        answer_text = "".join(full_answer)
        if len(_CACHE) >= _CACHE_MAX:
            oldest = _CACHE_ORDER.pop(0)
            _CACHE.pop(oldest, None)
        _CACHE[ck] = {"answer": answer_text, "citations": citations}
        _CACHE_ORDER.append(ck)

    except Exception as e:
        logger.error(f"Generation stream error: {type(e).__name__}: {e}")
        yield "I am unable to answer at this time due to an error."
