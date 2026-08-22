import asyncio
import time
import uuid
import logging
from fastapi import APIRouter, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
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

    try:
        audio_data = await audio.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid audio file")
    if len(audio_data) > settings.MAX_AUDIO_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Audio exceeds {settings.MAX_AUDIO_MB}MB")

    t0 = time.perf_counter()
    try:
        fname = audio.filename or "recording.webm"
        transcript = await transcribe_audio(audio_data, fname)
    except Exception as e:
        metrics.incr("errors")
        raise HTTPException(status_code=502, detail=str(e))
    lm.stt = int((time.perf_counter() - t0) * 1000)
    
    if not transcript or len(transcript.strip()) < 2:
        return VoiceQueryResponse(
            request_id=request_id, transcript=transcript,
            answer="I couldn't hear what you said. Could you repeat?",
            citations=[], grounded=False, confidence=0.0, latency_ms=lm)

    t0 = time.perf_counter()
    store = get_store(settings)
    route = await asyncio.to_thread(store.check_guardrails, transcript)
    lm.rerank = int((time.perf_counter() - t0) * 1000)

    if route is not None:
        lm.total = int((time.perf_counter() - t_start) * 1000)
        answer = "I'm sorry, but I cannot fulfill this request as it is out of scope or violates safety guardrails."
        if route == "chitchat":
            answer = f"Hi, I'm {settings.ASSISTANT_NAME}! Ask me anything about the dataset."
            
        return VoiceQueryResponse(
            request_id=request_id, transcript=transcript,
            answer=answer,
            citations=[], grounded=(route == "chitchat"), confidence=0.0, latency_ms=lm)

    t0 = time.perf_counter()
    retrieved_context = await store.retrieve(transcript, top_k=3)
    lm.retrieval = int((time.perf_counter() - t0) * 1000)

    t0 = time.perf_counter()
    gen_result = await generate_answer(transcript, retrieved_context)
    lm.generation = int((time.perf_counter() - t0) * 1000)

    t0 = time.perf_counter()
    valid_citations = []
    valid_ids = {c["chunk_id"] for c in retrieved_context}
    for cit in gen_result.get("citations", []):
        if cit.get("chunk_id") in valid_ids:
            valid_citations.append(Citation(**cit))
            
    # Deterministic Grounding validation
    grounded = True
    if len(retrieved_context) == 0:
        grounded = False
        
    lm.validation = int((time.perf_counter() - t0) * 1000)
    lm.total = int((time.perf_counter() - t_start) * 1000)

    return VoiceQueryResponse(
        request_id=request_id, transcript=transcript,
        answer=gen_result.get("answer", ""), citations=valid_citations,
        grounded=grounded,
        confidence=gen_result.get("confidence", 0.0), latency_ms=lm)

@router.websocket("/ws")
async def websocket_voice_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connected.")
    try:
        while True:
            # We expect binary audio data
            data = await websocket.receive_bytes()
            
            await websocket.send_json({"status": "transcribing"})
            t_start = time.perf_counter()
            transcript = await transcribe_audio(data, "ws_recording.webm")
            
            if not transcript or len(transcript.strip()) < 2:
                await websocket.send_json({
                    "status": "error",
                    "transcript": "",
                    "answer": "I couldn't hear what you said."
                })
                continue
                
            await websocket.send_json({
                "status": "searching",
                "transcript": transcript
            })
            
            store = get_store(settings)
            route = await asyncio.to_thread(store.check_guardrails, transcript)
            if route is not None:
                answer = "I'm sorry, I cannot fulfill this request."
                if route == "chitchat":
                    answer = f"Hi, I'm {settings.ASSISTANT_NAME}! Ask me anything."
                await websocket.send_json({"status": "done", "transcript": transcript, "answer": answer})
                continue
                
            # Hybrid search
            retrieved_context = await store.retrieve(transcript, top_k=3)
            await websocket.send_json({"status": "answering", "transcript": transcript})
            
            # For this MVP WebSocket we can just use the standard generator and stream the result back
            # Real streaming LLM logic should yield tokens here, but for now we generate and return.
            gen_result = await generate_answer(transcript, retrieved_context)
            
            await websocket.send_json({
                "status": "done",
                "transcript": transcript,
                "answer": gen_result.get("answer", ""),
                "latency_ms": int((time.perf_counter() - t_start)*1000)
            })
            
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected.")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except:
            pass
