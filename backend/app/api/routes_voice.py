import asyncio
import time
import uuid
import logging
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from app.schemas.responses import VoiceQueryResponse, LatencyMetrics, Citation
from app.services.sarvam_stt import transcribe_audio
from app.services.generator import generate_answer
from app.repositories.vector_store import get_store
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/query", response_model=VoiceQueryResponse)
async def process_voice_query(audio: UploadFile = File(...)):
    request_id = str(uuid.uuid4())
    logger.info(f"[{request_id}] Received voice query")
    
    t_start = time.perf_counter()
    metrics = LatencyMetrics()
    
    # 1. Read Audio
    try:
        audio_data = await audio.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid audio file")

    # 2. STT — external network call, dominates voice latency (typically 400-800ms)
    t0 = time.perf_counter()
    try:
        # Use actual filename/mime so Sarvam can detect codec (webm from MediaRecorder)
        fname = audio.filename or "recording.webm"
        transcript = await transcribe_audio(audio_data, fname)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    metrics.stt = int((time.perf_counter() - t0) * 1000)
    
    logger.info(f"[{request_id}] Transcript: {transcript}")
    
    if not transcript or len(transcript.strip()) < 2:
        # Guardrail: empty transcript
        return VoiceQueryResponse(
            request_id=request_id,
            transcript=transcript,
            answer="I couldn't hear what you said. Could you repeat?",
            citations=[],
            grounded=False,
            confidence=0.0,
            latency_ms=metrics
        )

    # 3. Retrieval — offload sync embedding+FAISS to threadpool (primary pipeline <200ms target)
    t0 = time.perf_counter()
    store = get_store(settings)
    retrieved_context = await asyncio.to_thread(store.hybrid_search, transcript, 3)
    metrics.retrieval = int((time.perf_counter() - t0) * 1000)
    
    logger.info(f"[{request_id}] Retrieved {len(retrieved_context)} chunks")

    # 4. Generation — with LRU cache hot hit ~5ms, cold ~250-400ms (Groq network)
    t0 = time.perf_counter()
    gen_result = await generate_answer(transcript, retrieved_context)
    metrics.generation = int((time.perf_counter() - t0) * 1000)

    # 5. Validation/Guardrails (simple check)
    t0 = time.perf_counter()
    # Check if citations are valid
    valid_citations = []
    if "citations" in gen_result:
        valid_chunk_ids = {c["chunk_id"] for c in retrieved_context}
        for cit in gen_result["citations"]:
            if cit.get("chunk_id") in valid_chunk_ids:
                valid_citations.append(Citation(**cit))
    
    metrics.validation = int((time.perf_counter() - t0) * 1000)
    
    # Total
    metrics.total = int((time.perf_counter() - t_start) * 1000)
    
    logger.info(f"[{request_id}] Completed in {metrics.total}ms (stt={metrics.stt}ms retrieval={metrics.retrieval}ms gen={metrics.generation}ms)")

    return VoiceQueryResponse(
        request_id=request_id,
        transcript=transcript,
        answer=gen_result.get("answer", ""),
        citations=valid_citations,
        grounded=gen_result.get("grounded", False),
        confidence=gen_result.get("confidence", 0.0),
        latency_ms=metrics
    )
