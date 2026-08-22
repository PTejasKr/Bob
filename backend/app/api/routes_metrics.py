import time
from fastapi import APIRouter
from app.core import metrics

router = APIRouter()

@router.get("/metrics")
def get_metrics():
    """Aggregate latency percentiles + counters for the frontend metric cards."""
    return metrics.snapshot()
