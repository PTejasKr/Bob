FROM node:22 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app

# Install system dependencies (build-essential needed for some py packages)
RUN apt-get update && apt-get install -y build-essential curl && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY backend/ ./backend/
# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
# Copy pre-computed data/db
COPY data/ ./data/

# Expose port
EXPOSE 8000

WORKDIR /app/backend

# Run
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
