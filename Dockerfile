FROM node:22 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y build-essential curl && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY backend/ ./backend/
# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
# Copy pre-computed data/db
COPY data/ ./data/

# Ensure retrieval module is importable from backend/
ENV PYTHONPATH="/app/backend:${PYTHONPATH}"
ENV HF_HOME="/app/.cache"

# Pre-download the embedding model into a local folder to avoid HF caching logic/network checks on boot
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='sentence-transformers/all-MiniLM-L6-v2', local_dir='/app/model_cache', allow_patterns=['*.json', '*.txt', 'onnx/model.onnx', 'vocab.txt'])"

EXPOSE 8000

WORKDIR /app/backend

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
