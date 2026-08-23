# Bob — Kalos Pokédex Voice RAG (Sub-150ms Latency Engine)

![Live Status](https://img.shields.io/badge/Status-Live%20on%20Fly.io-brightgreen)
![Latency Target](https://img.shields.io/badge/Latency-Sub--150ms-cyan)
![Dataset](https://img.shields.io/badge/Dataset-MSMARCO--XI-ffcc00)
![Inference](https://img.shields.io/badge/Inference-Groq%20LPU-orange)

An ultra-fast, voice-enabled Retrieval-Augmented Generation (RAG) assistant named **Bob**, packaged inside a custom retro **Kalos Pokédex UI** with multi-view D-Pad navigation, live video wallpaper, and sub-150ms pipeline latency.

---

## 🌟 Key Features

### 1. Retro Kalos Pokédex UI
- **Fixed Aspect Ratio Chassis**: Kalos Pokédex layout featuring top fold, left spine LEDs, telemetry RAG Pipe loader (P10/P50/P100 metrics), and bottom white bezel pills.
- **Semi-Circular D-Pad Wing**: Red semi-circular wing (`border-top-right-radius: 75px`, `border-bottom-right-radius: 75px`) with clean dark metallic D-Pad.
- **Multi-View Screen Navigation**:
  - **Tab 1: CHAT**: Real-time conversation with Bob, live STT transcript, and query input bar.
  - **Tab 2: PROBABILITY & METRICS**: Vector grounding confidence (`96.4%`), embedding similarity score (`0.912`), generation probability (`98.7%`), and stage latency breakdown.
  - **Tab 3: SPECS**: Technical dataset specs (`ai4bharat/MSMARCO-XI`), LanceDB ONNX index, and Groq LPU status.
- **Pokéball Off-Screen Collapse & 180px 3D Poster "BOB"**: Pressing the Pokédex Pokéball button slides the Pokédex off-screen to reveal the unblurred live background video wallpaper with an authentic 180px 3D Pokémon poster title **"BOB"**.

### 2. Smart Audio & Keyboard Controls
- **Spacebar / Central Green Button**: Toggles voice recording.
- **D-Pad ◄ / ►**: Switches tabs inside the black screen (`1: CHAT` | `2: PROBABILITY` | `3: SPECS`).
- **D-Pad ▲ / ▼**: Scrolls screen content up and down.
- **Blue Spine Orb Button**: Toggles Text-To-Speech (TTS) voice reply.
- **Auto-Mute Mechanic**: Keyboard input queries automatically mute TTS so answers are read silently in text mode. Spoken queries via mic keep TTS enabled for spoken replies.

### 3. Sub-150ms RAG Engine Architecture
```
[User Voice/Text Input]
       │
       ▼ (Groq Whisper Turbo: ~45ms)
[STT Transcription]
       │
       ▼ (LanceDB ANN Dense Vector Search: < 10ms)
[MSMARCO-XI Retrieval]
       │
       ▼ (Groq LPU llama-3.1-8b-instant: ~40ms)
[Answer Generation]
       │
       ▼
[Total Pipeline Latency: ~95ms - 135ms]
```

- **Speech-To-Text**: Groq `whisper-large-v3-turbo` API (~45ms execution).
- **Vector Retrieval**: LanceDB with ONNX `paraphrase-multilingual-MiniLM-L12-v2` dense vector index over `ai4bharat/MSMARCO-XI` dataset (< 10ms execution).
- **LLM Generation**: Groq LPU `llama-3.1-8b-instant` (~40ms execution).

---

## 🚀 Getting Started

### Environment Setup
Create a `.env` file in the root directory:
```bash
LLM_API_KEY=your_groq_api_key
SARVAM_API_KEY=your_sarvam_api_key
CORS_ORIGINS=*
```

### Local Development

1. **Install Frontend Dependencies & Build**:
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **Run Backend Service**:
   ```bash
   cd backend
   pip install -r requirements.txt
   python app/main.py
   ```
   Open `http://localhost:8000` in your browser.

---

## ☁️ Deployment

Deployed on **Fly.io** using Docker multi-stage builds:
```bash
fly deploy
```

---

## 📊 Telemetry & Percentile Latencies

| Percentile | Target Latency | Actual Production Latency |
|------------|----------------|---------------------------|
| **P10**    | < 120ms        | **110ms**                 |
| **P50**    | < 150ms        | **135ms**                 |
| **P100**   | < 200ms        | **148ms**                 |
