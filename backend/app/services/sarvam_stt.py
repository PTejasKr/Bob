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

async def transcribe_audio(audio_data: bytes, filename: str = "audio.webm", content_type: str | None = None) -> str:
    if not audio_data:
        raise ValueError("Audio upload is empty")

    mime = content_type if content_type and content_type.startswith("audio/") else "audio/webm"
    if ";" in mime:
        mime = mime.split(";", 1)[0]
    
    client = _get_client()
    
    # Try Sarvam STT first
    try:
        sarvam_url = "https://api.sarvam.ai/speech-to-text-translate"
        sarvam_headers = {"api-subscription-key": settings.SARVAM_API_KEY}
        sarvam_files = {"file": (filename, audio_data, mime)}
        
        sarvam_resp = await client.post(sarvam_url, headers=sarvam_headers, files=sarvam_files)
        if sarvam_resp.status_code == 200:
            resp_data = sarvam_resp.json()
            return resp_data.get("transcript", resp_data.get("text", "")).strip()
    except Exception as e:
        logger.warning(f"Sarvam STT attempt failed: {e}")

    # Fallback to Groq Whisper API (whisper-large-v3-turbo)
    if settings.LLM_API_KEY:
        try:
            groq_resp = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.LLM_API_KEY}"},
                files={"file": (filename, audio_data, mime)},
                data={"model": "whisper-large-v3-turbo"}
            )
            if groq_resp.status_code == 200:
                return groq_resp.json().get("text", "").strip()
        except Exception as ge:
            logger.warning(f"Groq Whisper fallback failed: {ge}")

    raise Exception("STT request failed across primary and fallback services.")
