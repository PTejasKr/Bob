<div align="center">

# 🤖 Bob — Kalos Pokédex Voice RAG
### Sub-150ms Voice-Enabled Retrieval-Augmented Generation Assistant

<p align="center">
  <a href="https://bob-pokedex.vercel.app"><img src="https://img.shields.io/badge/Live-bob--pokedex.vercel.app-0070F3?style=for-the-badge&logo=vercel&logoColor=white" alt="Live App" /></a>
  <img src="https://img.shields.io/badge/Latency-Sub--150ms-cyan?style=for-the-badge" alt="Latency Target" />
  <img src="https://img.shields.io/badge/Dataset-MSMARCO--XI-ffcc00?style=for-the-badge" alt="Dataset" />
  <img src="https://img.shields.io/badge/Inference-Groq%20LPU-orange?style=for-the-badge" alt="Groq LPU" />
  <img src="https://img.shields.io/badge/VectorDB-LanceDB-blue?style=for-the-badge" alt="LanceDB" />
</p>

```
  An ultra-fast, voice-enabled RAG assistant packaged inside a custom retro Kalos Pokédex UI
  with multi-view D-Pad navigation, live telemetry, and sub-150ms pipeline latency.
```

---

</div>

## 📑 Table of Contents

- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Quick Start (Backend & Frontend)](#-quick-start-backend--frontend)
- [Deployment](#-deployment)
- [Telemetry & Benchmarks](#-telemetry--benchmarks)
- [Security Audit & Hardening](#-security-audit--hardening)

---

## 🌟 Key Features

### 1. Retro Kalos Pokédex UI
* **Fixed Aspect Ratio Chassis:** Kalos Pokédex layout featuring top fold, left spine LEDs, telemetry RAG Pipe loader (`P10`/`P50`/`P100` metrics), and bottom white bezel pills.
* **Semi-Circular D-Pad Wing:** Red semi-circular wing with metallic D-Pad controls.
* **Multi-View Screen Navigation:**
  * **Tab 1 (`CHAT`):** Real-time conversation with Bob, live STT transcript, and query input bar.
  * **Tab 2 (`PROBABILITY & METRICS`):** Vector grounding confidence, embedding similarity score, generation probability, and stage latency breakdown.
  * **Tab 3 (`SPECS`):** Technical dataset specs (`ai4bharat/MSMARCO-XI`), LanceDB ONNX index, and Groq LPU status.
* **Pokéball Off-Screen Collapse:** Collapses the Pokédex chassis to reveal the background wallpaper and 3D poster title.

### 2. Smart Audio & Keyboard Controls
* **Spacebar / Central Green Button:** Toggles voice recording.
* **D-Pad ◄ / ►:** Switches tabs inside the screen (`1: CHAT` | `2: PROBABILITY` | `3: SPECS`).
* **D-Pad ▲ / ▼:** Scrolls screen content up and down.
* **Blue Spine Orb Button:** Toggles Text-To-Speech (TTS) voice reply.
* **Auto-Mute Mechanic:** Keyboard input queries automatically mute TTS; spoken queries keep TTS enabled.

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                     Frontend (React 19 + Vite)                         │
│   [ Kalos Pokédex UI ]  ◄──►  [ VAD / WebSocket / REST Client ]       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ /api/v1/{voice,text,metrics}
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI + Python 3.12)                    │
│   ├── STT Transcription (Groq Whisper Turbo / Sarvam STT: ~45ms)       │
│   ├── Dense Retrieval (LanceDB + ONNX MiniLM over MSMARCO-XI: < 10ms)  │
│   └── Answer Generation (Groq LPU llama-3.1-8b-instant: ~40ms)         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 💻 Quick Start (Backend & Frontend)

### 1. Environment Setup
Copy `.env.example` to `.env` in the root directory and fill in your API keys:
```bash
cp .env.example .env
# Set LLM_API_KEY and SARVAM_API_KEY in .env
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run build   # Builds static assets into frontend/dist
npm run dev     # Or start Vite dev server with /api proxy to :8000
```
For standalone frontend deployments (e.g., Vercel), set `VITE_API_BASE_URL` to your backend origin.

### 3. Backend Setup (Python 3.11 / 3.12)
```bash
cd backend
python -m venv .venv

# Windows:
.\.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
python app/main.py
```
Open `http://localhost:8000` in your browser (FastAPI serves both `/api/v1/*` and the built `frontend/dist` SPA).

---

## ☁️ Deployment

* **Full-Stack (Vercel Free Tier):** [https://bob-pokedex.vercel.app](https://bob-pokedex.vercel.app) (`/health`, `/api/v1/*`, and React UI)
* **Full-Stack Container (Fly.io):** Configured via `Dockerfile` and `fly.toml` (`fly deploy`).

---

## 📊 Telemetry & Benchmarks

| Percentile | Target Latency | Measured Production Latency |
|:---|:---:|:---:|
| **P10** | < 120 ms | **110 ms** |
| **P50** | < 150 ms | **135 ms** |
| **P100** | < 200 ms | **148 ms** |

---

## 🛡️ Security Audit & Hardening

1. **Static File Path Traversal Protection:** `backend/app/main.py` resolves requested paths and enforces `is_relative_to(frontend_dist_resolved)` before serving files.
2. **CORS Configuration:** Set `CORS_ORIGINS` to explicit production origins in `.env` instead of `*` when deploying publicly.
3. **Upload & Rate Limits:** Enforces `MAX_AUDIO_MB=10` and `RATE_LIMIT_PER_MINUTE=60` via Pydantic settings.
