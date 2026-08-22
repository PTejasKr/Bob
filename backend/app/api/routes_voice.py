import asyncio
import time
import uuid
import logging
from fastapi import APIRouter, File, UploadFile, HTTPException
from app.schemas.responses import VoiceQueryResponse, LatencyMetrics, Citation
from app.services.sarvam_stt import transcribe_audio
from app.services.generator import generate_answer
from app.repositories.lancedb_store import get_store
from app.core.config import settings
from app.core import metrics

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/query", response_model=VoiceQueryResponse)
async def process_voice_query(audio: UploadFile = File(...)):
    request_id = str(uuid.uuid4())
    logger.info(f"[{request_id}] Received voice query")

    t_start = time.perf_counter()
    metrics.incr("requests")
    lm = LatencyMetrics()

    # 1. Read audio (size guard)
    try:
        audio_data = await audio.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid audio file")
    if len(audio_data) > settings.MAX_AUDIO_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Audio exceeds {settings.MAX_AUDIO_MB}MB")

    # 2. STT — Sarvam saaras:v3
    t0 = time.perf_counter()
    try:
        fname = audio.filename or "recording.webm"
        transcript = await transcribe_audio(audio_data, fname)
    except Exception as e:
        metrics.incr("errors")
        raise HTTPException(status_code=502, detail=str(e))
    lm.stt = int((time.perf_counter() - t0) * 1000)
    metrics.record("stt", lm.stt)
    logger.info(f"[{request_id}] Transcript: {transcript!r}")

    if not transcript or len(transcript.strip()) < 2:
        return VoiceQueryResponse(
            request_id=request_id, transcript=transcript,
            answer="I couldn't hear what you said. Could you repeat?",
            citations=[], grounded=False, confidence=0.0, latency_ms=lm)

    # 3. Guardrail via LanceDB Store Engine (~2ms ONNX cosine)
    t0 = time.perf_counter()
    store = get_store(settings)
    route = await asyncio.to_thread(store.check_guardrails, transcript)
    lm.rerank = int((time.perf_counter() - t0) * 1000)  # reuse rerank field as router ms
    metrics.record("guardrail", lm.rerank)
    logger.info(f"[{request_id}] Route={route}")

    if route is not None:
        metrics.incr("blocked")
        lm.total = int((time.perf_counter() - t_start) * 1000)
        
        answer = "I'm sorry, but I cannot fulfill this request as it is out of scope or violates safety guardrails."
        if route == "chitchat":
            answer = f"Hi, I'm {settings.ASSISTANT_NAME}! Ask me anything about the dataset."
            
        return VoiceQueryResponse(
            request_id=request_id, transcript=transcript,
            answer=answer,
            citations=[], grounded=(route == "chitchat"), confidence=0.0, latency_ms=lm)

    # 4. Retrieval — FAISS+BM25 RRF offloaded to thread
    t0 = time.perf_counter()
    retrieved_context = await asyncio.to_thread(store.hybrid_search, transcript, 3)
    lm.retrieval = int((time.perf_counter() - t0) * 1000)
    metrics.record("retrieval", lm.retrieval)

    # 5. Generation — instructor structured output + LRU cache
    t0 = time.perf_counter()
    gen_result = await generate_answer(transcript, retrieved_context)
    lm.generation = int((time.perf_counter() - t0) * 1000)
    metrics.record("generation", lm.generation)

    # 6. Validation — citation whitelist
    t0 = time.perf_counter()
    valid_citations = []
    valid_ids = {c["chunk_id"] for c in retrieved_context}
    for cit in gen_result.get("citations", []):
        if cit.get("chunk_id") in valid_ids:
            valid_citations.append(Citation(**cit))
    lm.validation = int((time.perf_counter() - t0) * 1000)
    metrics.record("validation", lm.validation)

    lm.total = int((time.perf_counter() - t_start) * 1000)
    metrics.record("total", lm.total)
    logger.info(f"[{request_id}] Done total={lm.total}ms stt={lm.stt} ret={lm.retrieval} gen={lm.generation}")

    return VoiceQueryResponse(
        request_id=request_id, transcript=transcript,
        answer=gen_result.get("answer", ""), citations=valid_citations,
        grounded=gen_result.get("grounded", False),
        confidence=gen_result.get("confidence", 0.0), latency_ms=lm)
