import os
import json
import logging
from groq import AsyncGroq
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are {assistant_name}, a helpful AI assistant for a retrieval-augmented question answering system.
Rules:
1. Use ONLY the RETRIEVED CONTEXT supplied below.
2. Do NOT rely on outside knowledge.
3. Answer the user's question directly and concisely.
4. Every factual claim must be supported by the retrieved context.
5. If the context is insufficient, say that the available context does not contain enough information to answer reliably.
6. Return structured output in valid JSON format ONLY. Do not output markdown code blocks.

OUTPUT SCHEMA (Must return exactly this JSON structure):
{
  "answer": "string",
  "citations": [
    {
      "chunk_id": "string",
      "support": "string"
    }
  ],
  "grounded": true,
  "confidence": 0.0
}
"""

client = AsyncGroq(
    api_key=settings.LLM_API_KEY,
    # Groq uses base_url for compatibility but if it's default we can omit.
    # base_url=settings.LLM_BASE_URL
)

async def generate_answer(query: str, retrieved_context: list) -> dict:
    context_str = ""
    for idx, ctx in enumerate(retrieved_context):
        context_str += f"\n--- CHUNK {ctx['chunk_id']} ---\n{ctx['text']}\n"

    system_content = SYSTEM_PROMPT.format(assistant_name=settings.ASSISTANT_NAME)
    user_content = f"USER_QUERY: {query}\n\nRETRIEVED_CONTEXT: {context_str}"

    try:
        completion = await client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_content}
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=500
        )
        
        response_text = completion.choices[0].message.content
        return json.loads(response_text)
    except Exception as e:
        logger.error(f"Generation error: {e}")
        return {
            "answer": "I am unable to answer at this time due to an error.",
            "citations": [],
            "grounded": False,
            "confidence": 0.0
        }
