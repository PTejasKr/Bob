import asyncio
from groq import AsyncGroq
import os
from dotenv import load_dotenv

load_dotenv()
client = AsyncGroq(api_key=os.environ.get("LLM_API_KEY"))

async def test():
    with open("backend/test_audio.wav", "rb") as f:
        file = f.read()
    transcription = await client.audio.transcriptions.create(
      file=("test_audio.wav", file),
      model="whisper-large-v3-turbo",
    )
    print(transcription.text)

asyncio.run(test())
