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
from app.core.metrics import record_pipeline, incr

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/query", response_model=VoiceQueryResponse)
async def process_voice_query(audio: UploadFile = File(...)):
    request_id = str(uuid.uuid4())
    logger.info(f"[{request_id}] Received voice query")

    t_start = time.perf_counter()
    incr("requests")
    lm = LatencyMetrics()

    try:
        audio_data = await audio.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid audio file")
    if len(audio_data) > settings.MAX_AUDIO_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Audio exceeds {settings.MAX_AUDIO_MB}MB")

    # STT
    t0 = time.perf_counter()
    try:
        fname = audio.filename or "recording.webm"
        transcript = await transcribe_audio(audio_data, fname)
    except Exception as e:
        incr("errors")
        raise HTTPException(status_code=502, detail=str(e))
    lm.stt = int((time.perf_counter() - t0) * 1000)

    if not transcript or len(transcript.strip()) < 2:
        lm.total = int((time.perf_counter() - t_start) * 1000)
        record_pipeline(lm, "voice")
        return VoiceQueryResponse(
            request_id=request_id,
            transcript=transcript or "",
            answer="I couldn't hear what you said. Could you repeat?",
            citations=[],
            grounded=False,
            confidence=0.0,
            latency_ms=lm,
        )

    # Guardrail
    t0 = time.perf_counter()
    try:
        store = get_store(settings)
    except Exception as e:
        logger.warning(f"[{request_id}] Retrieval store unavailable ({e}); using fallback mode.")
        store = None
    route = await asyncio.to_thread(store.check_guardrails, transcript) if store else None
    lm.rerank = int((time.perf_counter() - t0) * 1000)

    if route is not None:
        lm.total = int((time.perf_counter() - t_start) * 1000)
        record_pipeline(lm, "voice")

        answer = "I'm sorry, but I cannot fulfill this request as it is out of scope or violates safety guardrails."
        if route == "chitchat":
            answer = f"Hi, I'm {settings.ASSISTANT_NAME}! Ask me anything about the dataset."

        return VoiceQueryResponse(
            request_id=request_id,
            transcript=transcript,
            answer=answer,
            citations=[],
            grounded=(route == "chitchat"),
            confidence=0.0,
            latency_ms=lm,
        )

    # Retrieval
    t0 = time.perf_counter()
    retrieved_context = await store.retrieve(transcript, top_k=3) if store else []
    lm.retrieval = int((time.perf_counter() - t0) * 1000)

    # Generation
    t0 = time.perf_counter()
    gen_result = await generate_answer(transcript, retrieved_context)
    lm.generation = int((time.perf_counter() - t0) * 1000)

    # Citation validation
    t0 = time.perf_counter()
    valid_citations = []
    valid_ids = {c["chunk_id"] for c in retrieved_context}
    for cit in gen_result.get("citations", []):
        if cit.get("chunk_id") in valid_ids:
            valid_citations.append(Citation(**cit))

    grounded = len(retrieved_context) > 0 and gen_result.get("grounded", False)
    lm.validation = int((time.perf_counter() - t0) * 1000)
    lm.total = int((time.perf_counter() - t_start) * 1000)
    record_pipeline(lm, "voice")

    logger.info(
        f"[{request_id}] voice_pipeline total={lm.total}ms "
        f"stt={lm.stt}ms retrieval={lm.retrieval}ms generation={lm.generation}ms"
    )

    return VoiceQueryResponse(
        request_id=request_id,
        transcript=transcript,
        answer=gen_result.get("answer", ""),
        citations=valid_citations,
        grounded=grounded,
        confidence=gen_result.get("confidence", 0.0),
        latency_ms=lm,
    )


@router.websocket("/ws")
async def websocket_voice_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket speculative streaming connected.")
    
    speculative_task = None
    last_transcript = ""

    async def run_pipeline(transcript: str, is_speculative: bool, stt_ms: int = 0, t_start: float = 0):
        try:
            # Guardrail
            store = get_store(settings)
            route = await asyncio.to_thread(store.check_guardrails, transcript)

            if route is not None:
                answer = "I'm sorry, I cannot fulfill this request."
                if route == "chitchat":
                    answer = f"Hi, I'm {settings.ASSISTANT_NAME}! Ask me anything about the dataset."
                total_ms = int((time.perf_counter() - t_start) * 1000)
                await websocket.send_json({
                    "status": "done",
                    "transcript": transcript,
                    "answer": answer,
                    "grounded": route == "chitchat",
                    "citations": [],
                    "latency_ms": {"stt": stt_ms, "total": total_ms},
                })
                return

            # Retrieval
            t0_ret = time.perf_counter()
            retrieved_context = await store.retrieve(transcript, top_k=3)
            retrieval_ms = int((time.perf_counter() - t0_ret) * 1000)

            await websocket.send_json({"status": "answering", "transcript": transcript, "speculative": is_speculative})

            # Generation Streaming
            from app.services.generator import generate_answer_stream
            
            full_answer = []
            async for token in generate_answer_stream(transcript, retrieved_context):
                full_answer.append(token)
                await websocket.send_json({
                    "status": "token",
                    "token": token
                })

            total_ms = int((time.perf_counter() - t_start) * 1000)

            await websocket.send_json({
                "status": "done",
                "transcript": transcript,
                "answer": "".join(full_answer),
                "grounded": len(retrieved_context) > 0,
                "citations": [],
                "latency_ms": {
                    "stt": stt_ms,
                    "retrieval": retrieval_ms,
                    "total": total_ms,
                },
            })
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Pipeline error: {e}")

    try:
        while True:
            message = await websocket.receive()
            if "text" in message:
                import json
                try:
                    data = json.loads(message["text"])
                    if data.get("type") == "speculate":
                        transcript = data.get("text", "").strip()
                        if len(transcript) > 5 and transcript != last_transcript:
                            last_transcript = transcript
                            if speculative_task and not speculative_task.done():
                                speculative_task.cancel()
                            await websocket.send_json({"status": "clear"})
                            speculative_task = asyncio.create_task(
                                run_pipeline(transcript, is_speculative=True, t_start=time.perf_counter())
                            )
                except Exception:
                    pass
            elif "bytes" in message:
                data = message["bytes"]
                t_start = time.perf_counter()

                await websocket.send_json({"status": "transcribing"})
                try:
                    final_transcript = await transcribe_audio(data, "ws_recording.webm")
                except Exception as e:
                    await websocket.send_json({"status": "error", "transcript": "", "answer": f"STT failed: {e}"})
                    continue

                if not final_transcript or len(final_transcript.strip()) < 2:
                    await websocket.send_json({"status": "error", "transcript": "", "answer": "I couldn't hear what you said."})
                    continue

                stt_ms = int((time.perf_counter() - t_start) * 1000)

                # Check if speculative is close enough
                is_match = False
                if last_transcript:
                    # simplistic check
                    if last_transcript.lower() in final_transcript.lower() or final_transcript.lower() in last_transcript.lower():
                        is_match = True
                
                if is_match and speculative_task and not speculative_task.done():
                    # Let the speculative task finish
                    pass
                else:
                    if speculative_task and not speculative_task.done():
                        speculative_task.cancel()
                    await websocket.send_json({"status": "clear"})
                    speculative_task = asyncio.create_task(
                        run_pipeline(final_transcript, is_speculative=False, stt_ms=stt_ms, t_start=t_start)
                    )

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected.")
        if speculative_task and not speculative_task.done():
            speculative_task.cancel()
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
