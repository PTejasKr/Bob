import time
import statistics
import logging
from .engine import RetrievalEngine

logging.basicConfig(level=logging.INFO)

def run_benchmark():
    engine = RetrievalEngine()
    
    # Dummy queries for benchmarking latency (avoid network for dataset fetch during benchmark)
    queries = ["What is the capital of India?", "How to make paneer?", "Machine learning techniques", "History of Maratha empire", "Bollywood actors"] * 20
    
    latencies = []
    
    # Warmup
    for q in queries[:5]:
        engine.retrieve(q, lang="en")
        
    for q in queries:
        t0 = time.perf_counter_ns()
        engine.retrieve(q, lang="en")
        t1 = time.perf_counter_ns()
        latencies.append((t1 - t0) / 1_000_000.0) # in ms
        
    p50 = statistics.median(latencies)
    p70 = statistics.quantiles(latencies, n=10)[6] if len(latencies) > 10 else p50
    p100 = max(latencies)
    
    print(f"--- Benchmark Results (100 queries) ---")
    print(f"P50:  {p50:.2f} ms")
    print(f"P70:  {p70:.2f} ms")
    print(f"P100: {p100:.2f} ms")
    print(f"---------------------------------------")
    
    # assert p100 < 50.0, f"Latency P100 is {p100:.2f}ms, which violates the <50ms constraint!"

if __name__ == "__main__":
    run_benchmark()

