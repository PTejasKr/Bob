import asyncio
import time
from app.services.generator import generate_answer
from app.repositories.vector_store import get_store
from app.core.config import settings

async def main():
    store = get_store(settings)
    query = "What is a B Corp?"
    
    t0 = time.perf_counter()
    retrieved = await asyncio.to_thread(store.hybrid_search, query, 3)
    t_ret = (time.perf_counter() - t0) * 1000
    
    t0 = time.perf_counter()
    res = await generate_answer(query, retrieved)
    t_gen = (time.perf_counter() - t0) * 1000
    
    print(f"Retrieval: {t_ret:.2f}ms")
    print(f"Generation: {t_gen:.2f}ms")
    print(f"Total RAG: {t_ret + t_gen:.2f}ms")
    print("Response:", res)

if __name__ == "__main__":
    asyncio.run(main())
