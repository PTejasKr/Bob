import time
import json
import logging
import asyncio
import httpx
import numpy as np
from tqdm import tqdm

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Test configuration
URL = "http://localhost:8001/api/v1/voice/query"
# Dummy audio path (should be a short 1-second wav file)
DUMMY_AUDIO = "../tests/unit/test_audio.wav"
NUM_REQUESTS = 50

async def send_request(client):
    try:
        with open(DUMMY_AUDIO, 'rb') as f:
            audio_data = f.read()
        
        files = {"audio": ("test_audio.wav", audio_data, "audio/wav")}
        
        t0 = time.perf_counter()
        response = await client.post(URL, files=files, timeout=20.0)
        total_time = (time.perf_counter() - t0) * 1000
        
        if response.status_code == 200:
            data = response.json()
            latency = data.get("latency_ms", {})
            latency["measured_total"] = total_time
            return latency
        else:
            logger.error(f"Failed: {response.status_code}")
            return None
    except Exception as e:
        logger.error(f"Request failed: {e}")
        return None

async def run_benchmark():
    logger.info("Warming up...")
    async with httpx.AsyncClient() as client:
        # Warmup
        await send_request(client)
        
        logger.info(f"Running {NUM_REQUESTS} requests sequentially...")
        results = []
        for _ in tqdm(range(NUM_REQUESTS)):
            res = await send_request(client)
            if res:
                results.append(res)
            # small delay to prevent massive rate limits
            await asyncio.sleep(0.5)
            
    if not results:
        logger.error("No valid results")
        return

    # Calculate percentiles
    measured_totals = [r["measured_total"] for r in results]
    stt_times = [r["stt"] for r in results]
    retrieval_times = [r["retrieval"] for r in results]
    gen_times = [r["generation"] for r in results]

    p50 = np.percentile(measured_totals, 50)
    p70 = np.percentile(measured_totals, 70)
    p100 = np.max(measured_totals)

    logger.info("=== Latency Benchmark ===")
    logger.info(f"P50: {p50:.2f} ms")
    logger.info(f"P70: {p70:.2f} ms")
    logger.info(f"P100 (Max): {p100:.2f} ms")
    
    logger.info("\n=== Breakdown (Averages) ===")
    logger.info(f"STT: {np.mean(stt_times):.2f} ms")
    logger.info(f"Retrieval: {np.mean(retrieval_times):.2f} ms")
    logger.info(f"Generation: {np.mean(gen_times):.2f} ms")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
