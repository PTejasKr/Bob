"""Quick smoke test for the retrieval engine."""
import sys
import time
import asyncio
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from retrieval.engine import RetrievalEngine

def main():
    print("=== Retrieval Engine Smoke Test ===")
    
    # Init
    t0 = time.perf_counter()
    engine = RetrievalEngine(db_path=str(ROOT / "data" / "lancedb"))
    engine.initialize()
    init_ms = int((time.perf_counter() - t0) * 1000)
    print(f"Init: {init_ms}ms")
    
    # Guardrails
    assert engine.check_guardrails("hello") == "chitchat"
    assert engine.check_guardrails("Who is the president?") == "politics"
    assert engine.check_guardrails("What is a corporation?") is None
    print("Guardrails: OK")
    
    # Retrieval queries
    queries = [
        "What is a corporation?",
        "How to incorporate a company?",
        "What are B Corps?",
        "Machine learning techniques",
        "Capital of India",
    ]
    
    latencies = []
    for q in queries:
        t0 = time.perf_counter()
        results = asyncio.run(engine.retrieve(q, top_k=3))
        ms = int((time.perf_counter() - t0) * 1000)
        latencies.append(ms)
        print(f"  [{ms:4d}ms] '{q}' -> {len(results)} results")
        for r in results[:2]:
            print(f"         {r['chunk_id']}: {r['text'][:60]}...")
    
    # Latency stats
    latencies.sort()
    p50 = latencies[len(latencies) // 2]
    p100 = latencies[-1]
    print(f"\nLatency: P50={p50}ms  P100={p100}ms")
    print("=== DONE ===")

if __name__ == "__main__":
    main()
