import json
import hashlib
import logging
from groq import AsyncGroq
from tenacity import retry, stop_after_attempt, wait_exponential
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are {assistant_name}, a retrieval-augmented QA assistant.
Rules: Use ONLY the RETRIEVED CONTEXT. Answer concisely (2-4 sentences). Every claim must be grounded in context. If insufficient, say so."""

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

_MAX_CHARS_PER_CHUNK = 420

TOOLS = [{
    "type": "function",
    "function": {
        "name": "provide_answer",
        "description": "Provide a grounded answer using ONLY the retrieved context.",
        "parameters": {
            "type": "object",
            "properties": {
                "answer": {"type": "string", "description": "Concisely answer the question (2-4 sentences) using ONLY the retrieved context. If insufficient, state that you don't know."},
                "citations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "chunk_id": {"type": "string"},
                            "support": {"type": "string", "description": "The exact quote from the context supporting this citation"}
                        },
                        "required": ["chunk_id", "support"]
                    }
                },
                "grounded": {"type": "boolean", "description": "True if the answer is completely supported by context."},
                "confidence": {"type": "number", "description": "Confidence score from 0.0 to 1.0"}
            },
            "required": ["answer", "citations", "grounded", "confidence"]
        }
    }
}]

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=4))
async def _call_llm_with_retry(client, model_name, system_content, user_content):
    completion = await client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content}
        ],
        tools=TOOLS,
        tool_choice={"type": "function", "function": {"name": "provide_answer"}},
        temperature=0.0,
        max_tokens=256,
    )
    
    message = completion.choices[0].message
    if message.tool_calls:
        return json.loads(message.tool_calls[0].function.arguments)
    raise ValueError("LLM did not return a tool call")

async def generate_answer(query: str, retrieved_context: list) -> dict:
    ck = _cache_key(query, retrieved_context)
    cached = _cache_get(ck)
    if cached is not None:
        return cached

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
        result = await _call_llm_with_retry(client, model_name, system_content, user_content)
        
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
