import os
import platform
import time
from fastapi import APIRouter
from app.core import metrics

router = APIRouter()
_START_TIME = time.time()


def _read_rss_mb() -> float | None:
    """Return resident set size in MB using stdlib /proc or resource when available."""
    try:
        with open("/proc/self/status", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("VmRSS:"):
                    kb = int(line.split()[1])
                    return round(kb / 1024.0, 2)
    except OSError:
        pass
    try:
        import resource  # POSIX only

        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        divisor = 1024.0 * 1024.0 if platform.system() == "Darwin" else 1024.0
        return round(rss / divisor, 2)
    except Exception:
        return None


@router.get("/metrics")
def get_metrics():
    """Aggregate latency percentiles + counters for the frontend metric cards."""
    return metrics.snapshot()


@router.get("/resources")
def get_resources():
    """Return lightweight process and runtime resource telemetry."""
    return {
        "status": "ok",
        "uptime_seconds": round(time.time() - _START_TIME, 2),
        "memory_rss_mb": _read_rss_mb(),
        "python_version": platform.python_version(),
        "platform": platform.system(),
        "pid": os.getpid(),
        "vercel": bool(os.environ.get("VERCEL")),
        "metrics": metrics.snapshot(),
    }
