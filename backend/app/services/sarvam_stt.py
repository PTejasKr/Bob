import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

# Persistent client — reused across requests, keep-alive, ~5-15ms saved per call
_client: httpx.AsyncClient | None = None

def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=2.0), limits=httpx.Limits(max_keepalive_connections=10, max_connections=20))
    return _client

async def transcribe_audio(audio_data: bytes, filename: str = "audio.wav", content_type: str | None = None) -> str:
    if not audio_data:
        raise ValueError("Audio upload is empty")

    url = "https://api.sarvam.ai/speech-to-text"
    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY
    }
    # Sarvam auto-detects; use unknown + saaras:v3 for best latency/accuracy
    # Detect mime from filename; webm from MediaRecorder is supported
    mime = content_type if content_type and content_type.startswith("audio/") else "audio/wav"
    if ";" in mime:
        mime = mime.split(";", 1)[0]
    lower = filename.lower()
    if (not content_type or not content_type.startswith("audio/")) and lower.endswith(".webm"):
        mime = "audio/webm"
    elif (not content_type or not content_type.startswith("audio/")) and lower.endswith(".mp3"):
        mime = "audio/mpeg"
    elif (not content_type or not content_type.startswith("audio/")) and (lower.endswith(".m4a") or lower.endswith(".mp4")):
        mime = "audio/m4a"
    elif (not content_type or not content_type.startswith("audio/")) and lower.endswith(".ogg"):
        mime = "audio/ogg"
    files = {
        "file": (filename, audio_data, mime)
    }
    data = {
        "model": "saaras:v3",
        "mode": "transcribe",
    }
    client = _get_client()
    try:
        response = await client.post(url, headers=headers, files=files, data=data)
        response.raise_for_status()
        result = response.json()
        transcript = result.get("transcript")
        if not isinstance(transcript, str):
            raise ValueError("Sarvam returned an invalid transcript")
        return transcript.strip()
    except httpx.HTTPStatusError as e:
        logger.error(f"Sarvam API Error {e.response.status_code}: {e.response.text[:500]}")
        raise Exception(f"STT failed: {e.response.status_code}")
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"STT Error: {type(e).__name__}: {str(e)[:400]}")
        raise Exception("STT request failed")
