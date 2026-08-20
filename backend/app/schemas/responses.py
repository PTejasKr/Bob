from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class Citation(BaseModel):
    chunk_id: str
    support: str

class LatencyMetrics(BaseModel):
    stt: int = 0
    retrieval: int = 0
    rerank: int = 0
    generation: int = 0
    validation: int = 0
    total: int = 0

class VoiceQueryResponse(BaseModel):
    request_id: str
    transcript: str
    answer: str
    citations: List[Citation]
    grounded: bool
    confidence: float
    latency_ms: LatencyMetrics
