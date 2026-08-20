import time
import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

async def transcribe_audio(audio_data: bytes, filename: str = "audio.wav") -> str:
    url = "https://api.sarvam.ai/speech-to-text"
    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY
    }
    files = {
        "file": (filename, audio_data, "audio/wav")
    }
    # Optional parameters based on Sarvam's docs
    data = {
        "language_code": "hi-IN", # Assuming we want Hindi/English mixed. Sarvam usually auto-detects or requires a language code. We'll pass 'hi-IN' or 'en-IN' if it expects one. Wait, let's omit if not strictly required, or specify hi-IN. Let's use 'en-IN' as default.
    }
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(url, headers=headers, files=files, data=data)
            response.raise_for_status()
            result = response.json()
            return result.get("transcript", "")
        except httpx.HTTPStatusError as e:
            logger.error(f"Sarvam API Error: {e.response.text}")
            raise Exception(f"STT failed: {e.response.status_code}")
        except Exception as e:
            logger.error(f"STT Error: {str(e)}")
            raise Exception("STT request failed")
