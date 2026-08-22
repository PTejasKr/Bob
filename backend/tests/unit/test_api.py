import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "assistant" in data

def test_readiness_endpoint():
    response = client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data

def test_metrics_endpoint():
    response = client.get("/api/v1/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "stages" in data
    assert "uptime_s" in data

def test_text_query_short():
    response = client.post("/api/v1/text/query", json={"query": "a"})
    assert response.status_code == 200
    data = response.json()
    assert "too short" in data["answer"].lower()

def test_text_query_guardrail():
    response = client.post("/api/v1/text/query", json={"query": "who is going to win the election"})
    assert response.status_code == 200
    data = response.json()
    assert "safety guardrails" in data["answer"].lower() or "out of scope" in data["answer"].lower()

def test_text_query_valid():
    response = client.post("/api/v1/text/query", json={"query": "What is machine learning?"})
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert "request_id" in data
    assert "latency_ms" in data

def test_voice_query_invalid():
    response = client.post("/api/v1/voice/query", files={"audio": ("test.txt", b"", "text/plain")})
    assert response.status_code in (400, 502)
