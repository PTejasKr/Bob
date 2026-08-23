import asyncio
import time
import uuid
import logging
from fastapi import APIRouter
from pydantic import BaseModel
from app.schemas.responses import VoiceQueryResponse, LatencyMetrics, Citation
from app.services.generator import generate_answer
from app.repositories.lancedb_store import get_store
from app.core.config import settings
from app.core.metrics import record_pipeline

logger = logging.getLogger(__name__)
router = APIRouter()


class TextQueryRequest(BaseModel):
    query: str
    top_k: int = 3


@router.post("/query", response_model=VoiceQueryResponse)
async def process_text_query(req: TextQueryRequest):
    request_id = str(uuid.uuid4())
    t_start = time.perf_counter()
    metrics = LatencyMetrics()

    query = (req.query or "").strip()
    if len(query) < 2:
        return VoiceQueryResponse(
            request_id=request_id,
            transcript=query,
            answer="Query too short. Please ask a question.",
            citations=[],
            grounded=False,
            confidence=0.0,
            latency_ms=metrics,
        )

    store = get_store(settings)

    # Guardrail check
    t0 = time.perf_counter()
    matched_route = await asyncio.to_thread(store.check_guardrails, query)
    metrics.rerank = int((time.perf_counter() - t0) * 1000)

    if matched_route is not None:
        logger.warning(f"[{request_id}] Blocked: guardrail={matched_route}")
        metrics.total = int((time.perf_counter() - t_start) * 1000)
        record_pipeline(metrics, "text")

        answer = "I'm sorry, but I cannot fulfill this request as it is out of scope or violates safety guardrails."
        if matched_route == "chitchat":
            answer = f"Hi, I'm {settings.ASSISTANT_NAME}! Ask me anything about the dataset."

        return VoiceQueryResponse(
            request_id=request_id,
            transcript=query,
            answer=answer,
            citations=[],
            grounded=(matched_route == "chitchat"),
            confidence=0.0,
            latency_ms=metrics,
        )

    # Retrieval
    t0 = time.perf_counter()
    retrieved_context = await store.retrieve(query, top_k=req.top_k)
    metrics.retrieval = int((time.perf_counter() - t0) * 1000)

    # Generation
    t0 = time.perf_counter()
    gen_result = await generate_answer(query, retrieved_context)
    metrics.generation = int((time.perf_counter() - t0) * 1000)

    # Citation validation
    t0 = time.perf_counter()
    valid_citations = []
    valid_ids = {c["chunk_id"] for c in retrieved_context}
    for cit in gen_result.get("citations", []):
        if cit.get("chunk_id") in valid_ids:
            valid_citations.append(Citation(**cit))
    metrics.validation = int((time.perf_counter() - t0) * 1000)

    # Grounding check
    grounded = len(retrieved_context) > 0 and gen_result.get("grounded", False)

    metrics.total = int((time.perf_counter() - t_start) * 1000)
    record_pipeline(metrics, "text")
    logger.info(
        f"[{request_id}] text_pipeline total={metrics.total}ms "
        f"retrieval={metrics.retrieval}ms generation={metrics.generation}ms"
    )

    return VoiceQueryResponse(
        request_id=request_id,
        transcript=query,
        answer=gen_result.get("answer", ""),
        citations=valid_citations,
        grounded=grounded,
        confidence=gen_result.get("confidence", 0.0),
        latency_ms=metrics,
    )
