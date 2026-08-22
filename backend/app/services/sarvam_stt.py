import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None

def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(8.0, connect=2.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20)
        )
    return _client

async def transcribe_audio(audio_data: bytes, filename: str = "audio.wav", content_type: str | None = None) -> str:
    if not audio_data:
        raise ValueError("Audio upload is empty")

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

    client = _get_client()
    try:
        # Reverting back to Sarvam AI as requested by user
        sarvam_url = "https://api.sarvam.ai/speech-to-text-translate"
        sarvam_headers = {"api-subscription-key": settings.SARVAM_API_KEY}
        sarvam_files = {"file": (filename, audio_data, mime)}
        
        sarvam_resp = await client.post(sarvam_url, headers=sarvam_headers, files=sarvam_files)
        sarvam_resp.raise_for_status()
        
        resp_data = sarvam_resp.json()
        return resp_data.get("transcript", resp_data.get("text", "")).strip()
    except Exception as e:
        logger.error(f"Sarvam STT Error: {e}")
        raise Exception(f"STT request failed: {e}")
