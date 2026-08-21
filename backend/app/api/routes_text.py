import asyncio
import time
import uuid
import logging
from fastapi import APIRouter
from pydantic import BaseModel
from app.schemas.responses import VoiceQueryResponse, LatencyMetrics, Citation
from app.services.generator import generate_answer
from app.repositories.vector_store import get_store
from app.core.config import settings

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

    t0 = time.perf_counter()
    store = get_store(settings)
    retrieved_context = await asyncio.to_thread(store.hybrid_search, query, req.top_k)
    metrics.retrieval = int((time.perf_counter() - t0) * 1000)

    t0 = time.perf_counter()
    gen_result = await generate_answer(query, retrieved_context)
    metrics.generation = int((time.perf_counter() - t0) * 1000)

    t0 = time.perf_counter()
    valid_citations = []
    if "citations" in gen_result:
        valid_ids = {c["chunk_id"] for c in retrieved_context}
        for cit in gen_result["citations"]:
            if cit.get("chunk_id") in valid_ids:
                valid_citations.append(Citation(**cit))
    metrics.validation = int((time.perf_counter() - t0) * 1000)

    metrics.total = int((time.perf_counter() - t_start) * 1000)
    logger.info(f"[{request_id}] text_pipeline total={metrics.total}ms retrieval={metrics.retrieval}ms generation={metrics.generation}ms")

    return VoiceQueryResponse(
        request_id=request_id,
        transcript=query,
        answer=gen_result.get("answer", ""),
        citations=valid_citations,
        grounded=gen_result.get("grounded", False),
        confidence=gen_result.get("confidence", 0.0),
        latency_ms=metrics,
    )
