# HH Goa 2026: Voice-Enabled RAG System

This project is a high-performance, voice-enabled Retrieval-Augmented Generation (RAG) system built for the HH Goa 2026 Shortlisting Task. It transcribes voice using Sarvam STT, retrieves context using a hybrid FAISS/BM25 approach over the MSMARCO-XI dataset, and generates grounded answers using a fast LLM.

## Architecture & "Turbo Mode"

To achieve the sub-200ms latency target ("Turbo Mode"), the system utilizes:
1. **Local Embeddings**: `all-MiniLM-L6-v2` via `sentence-transformers` avoids network embedding latency.
2. **Hybrid In-Memory Retrieval**: FAISS for dense vector search and BM25 for lexical search, fused with RRF (Reciprocal Rank Fusion).
3. **Groq LPU**: We leverage Groq's high-speed inference for the generation step to ensure the LLM doesn't bottleneck the response.
4. **Asynchronous Orchestration**: FastAPI and HTTPX handle STT and LLM generation concurrently where possible.
5. **Pre-loading**: All models and indexes are loaded during app startup.

## Setup Instructions

### 1. Environment Configuration
Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```
Ensure `SARVAM_API_KEY` and `LLM_API_KEY` (Groq recommended) are set.

### 2. Dataset Ingestion & Indexing
The MSMARCO-XI dataset is massive and contains multi-lingual duplicated context. We use a subset and filter it down to unique passages for performance testing.

```bash
cd ingestion
pip install -r ../backend/requirements.txt
# 1. Download and extract a subset of unique passages
python download_dataset.py
# 2. Build the FAISS and BM25 indexes
python build_indexes.py
```

### 3. Run the Backend
You can run the backend locally or via Docker.

**Local:**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Docker:**
```bash
cd infra
docker-compose up --build
```

### 4. Run the Frontend
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173` to test the voice input.

## Evaluation & Benchmarks

Run the latency benchmark to measure P50, P70, and P100.
```bash
cd evaluation
python benchmark_latency.py
```

*Note: Initial requests may be slower due to cold starts. The benchmark script includes a warmup request.*

## Guardrails
The system implements strict guardrails:
- Refuses to answer if the STT transcript is empty or malformed.
- Validates the LLM output's citations against the retrieved chunk IDs.
- System prompt strictly enforces answering *only* from the retrieved context.
