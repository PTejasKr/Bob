"""
Latency metrics tracker in-process ring buffer, percentile reporting.
Feeds GET /api/v1/metrics (p50/p70/p100 per stage) for the frontend metric cards.
"""
import time
import threading
from collections import deque
import numpy as np

_lock = threading.Lock()
_MAX_SAMPLES = 500

# stage -> deque[float ms]
_samples: dict[str, deque] = {
    "stt": deque(maxlen=_MAX_SAMPLES),
    "guardrail": deque(maxlen=_MAX_SAMPLES),
    "retrieval": deque(maxlen=_MAX_SAMPLES),
    "generation": deque(maxlen=_MAX_SAMPLES),
    "validation": deque(maxlen=_MAX_SAMPLES),
    "total": deque(maxlen=_MAX_SAMPLES),
}
_counters = {"requests": 0, "errors": 0, "cache_hits": 0, "blocked": 0}
_start = time.time()

def record(stage: str, ms: float):
    with _lock:
        if stage in _samples:
            _samples[stage].append(float(ms))

def incr(counter: str):
    with _lock:
        if counter in _counters:
            _counters[counter] += 1

def snapshot() -> dict:
    with _lock:
        out = {"uptime_s": int(time.time() - _start), **_counters, "stages": {}}
        for stage, dq in _samples.items():
            if not dq:
                out["stages"][stage] = {"n": 0, "p10": 0, "p50": 0, "p100": 0, "mean": 0}
                continue
            arr = np.fromiter(dq, dtype=float)
            out["stages"][stage] = {
                "n": int(arr.size),
                "p10": round(float(np.percentile(arr, 10)), 1),
                "p50": round(float(np.percentile(arr, 50)), 1),
                "p100": round(float(arr.max()), 1),
                "mean": round(float(arr.mean()), 1),
            }
        return out

def record_pipeline(metrics, source: str):
    if hasattr(metrics, "stt") and metrics.stt > 0:
        record("stt", metrics.stt)
    if hasattr(metrics, "guardrail") and metrics.guardrail > 0:
        record("guardrail", metrics.guardrail)
    if hasattr(metrics, "retrieval") and metrics.retrieval > 0:
        record("retrieval", metrics.retrieval)
    if hasattr(metrics, "generation") and metrics.generation > 0:
        record("generation", metrics.generation)
    if hasattr(metrics, "validation") and metrics.validation > 0:
        record("validation", metrics.validation)
    if hasattr(metrics, "total") and metrics.total > 0:
        record("total", metrics.total)
    incr("requests")
