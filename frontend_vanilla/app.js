// Initialize Lucide Icons
if (window.lucide) {
  lucide.createIcons();
}

// Elements
const pokeballLauncher = document.getElementById('pokeball-launcher');
const pokedexModal = document.getElementById('pokedex-modal');
const minimizeBtn = document.getElementById('pokedex-minimize-btn');
const blueStartBtn = document.getElementById('blue-start-btn');
const dotmatrixBlobBtn = document.getElementById('dotmatrix-blob-btn');
const canvas = document.getElementById('dotmatrix-canvas');
const rightWingLabel = document.getElementById('right-wing-label');
const chatViewport = document.getElementById('chat-viewport');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const headerStatusText = document.getElementById('header-status-text');

// RAG loader elements
const ragStageLabel = document.getElementById('rag-stage-label');
const ragFillBar = document.getElementById('rag-fill-bar');
const ragTelemetryText = document.getElementById('rag-telemetry-text');
const ledTop = document.getElementById('led-top');
const ledBottom = document.getElementById('led-bottom');

// State
let isListening = false;
let isProcessing = false;
let liveTranscript = '';
let interimRowEl = null;

// Toggle Pokedex visibility
function togglePokedex() {
  pokedexModal.classList.toggle('hidden');
}

pokeballLauncher.addEventListener('click', togglePokedex);
minimizeBtn.addEventListener('click', togglePokedex);

// -------------------------------------------------------------
// DOT-MATRIX CANVAS ANIMATION LOOP (ChatGPT Blob + dotm-circular-8)
// -------------------------------------------------------------
const ctx = canvas.getContext('2d');
let transitionProgress = 0; // 0 = idle white blob, 1 = dot-matrix active
let animTime = 0;

function renderCanvas() {
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;

  ctx.clearRect(0, 0, width, height);

  const targetTransition = isListening || isProcessing ? 1 : 0;
  transitionProgress += (targetTransition - transitionProgress) * 0.08;
  animTime += isListening ? 0.045 : isProcessing ? 0.06 : 0.02;

  const t = animTime;

  // 1. IDLE STATE: Smooth Organic White Morphing Blob
  if (transitionProgress < 0.98) {
    ctx.save();
    ctx.globalAlpha = 1 - transitionProgress;

    const glowRad = 48 + Math.sin(t * 2) * 4;
    const glowGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, glowRad);
    glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    glowGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.65)');
    glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRad, 0, Math.PI * 2);
    ctx.fill();

    const points = 7;
    const baseR = 30 + Math.sin(t * 1.5) * 3;
    const coords = [];
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const wave = Math.sin(t * 2.5 + i * 1.8) * 4 + Math.cos(t * 1.8 + i * 0.9) * 3;
      const r = baseR + wave;
      coords.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      });
    }

    ctx.beginPath();
    ctx.moveTo((coords[0].x + coords[points - 1].x) / 2, (coords[0].y + coords[points - 1].y) / 2);
    for (let i = 0; i < points; i++) {
      const next = coords[(i + 1) % points];
      const curr = coords[i];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    }
    ctx.closePath();

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 16;
    ctx.fill();

    ctx.restore();
  }

  // 2. ACTIVE STATE: DotMatrix Pixelated Glowing Equalizer (dotm-circular-8)
  if (transitionProgress > 0.02) {
    ctx.save();
    ctx.globalAlpha = transitionProgress;

    const matrixGlow = ctx.createRadialGradient(cx, cy, 15, cx, cy, 62);
    matrixGlow.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    matrixGlow.addColorStop(0.5, 'rgba(100, 200, 255, 0.2)');
    matrixGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = matrixGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 62, 0, Math.PI * 2);
    ctx.fill();

    const coreSize = 6 + Math.sin(t * 4) * 1.5;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 12;
    ctx.fillRect(cx - coreSize / 2, cy - coreSize / 2, coreSize, coreSize);

    const rings = [
      { radius: 14, count: 8, dotSize: 3.2, speed: 1.2 },
      { radius: 23, count: 12, dotSize: 3.5, speed: -0.9 },
      { radius: 33, count: 16, dotSize: 3.8, speed: 1.5 },
      { radius: 43, count: 20, dotSize: 4.0, speed: -1.1 },
      { radius: 52, count: 24, dotSize: 3.6, speed: 1.8 },
    ];

    rings.forEach((ring, rIdx) => {
      const { radius, count, dotSize, speed } = ring;
      const ringRotation = t * speed;

      for (let i = 0; i < count; i++) {
        const baseAngle = (i / count) * Math.PI * 2;
        const angle = baseAngle + ringRotation;
        const wavePhase = Math.sin(t * 3.5 + baseAngle * 4 + rIdx * 1.2);
        const isDotActive = isProcessing
          ? Math.sin(t * 5 + i * 0.8 + rIdx) > -0.2
          : Math.sin(t * 4 + baseAngle * 3) > -0.4;

        const dynamicRadius = radius + (isDotActive ? wavePhase * 2.5 : 0);
        const px = cx + Math.cos(angle) * dynamicRadius;
        const py = cy + Math.sin(angle) * dynamicRadius;
        const size = isDotActive ? dotSize * 1.2 : dotSize * 0.85;

        ctx.save();
        ctx.fillStyle = isDotActive ? '#ffffff' : 'rgba(180, 220, 255, 0.4)';
        if (isDotActive) {
          ctx.shadowColor = isProcessing ? '#00e5ff' : '#ffffff';
          ctx.shadowBlur = 10;
        }
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
        ctx.restore();
      }
    });

    ctx.restore();
  }

  requestAnimationFrame(renderCanvas);
}

renderCanvas();

// -------------------------------------------------------------
// RAG LOADING BAR STAGE CONTROLLER
// -------------------------------------------------------------
function setRagStage(stage, latencyMs = null) {
  if (stage === 'idle') {
    ragStageLabel.textContent = 'STANDBY';
    ragStageLabel.style.color = '#8b949e';
    ragFillBar.style.height = '0%';
    ragFillBar.style.backgroundColor = '#00e676';
    ragTelemetryText.textContent = 'READY';
    ragTelemetryText.className = 'telemetry-text dim';
    headerStatusText.textContent = 'STANDBY';
    headerStatusText.style.color = '#FFE81F';
    ledTop.className = 'pokedex-led led-top lit-green';
    ledBottom.className = 'pokedex-led led-bottom lit-green';
  } else if (stage === 'listening') {
    ragStageLabel.textContent = 'AUDIO IN';
    ragStageLabel.style.color = '#00e5ff';
    ragFillBar.style.height = '20%';
    ragFillBar.style.backgroundColor = '#00e5ff';
    ragTelemetryText.textContent = 'STREAMING';
    ragTelemetryText.className = 'telemetry-text';
    headerStatusText.textContent = 'AUDIO STREAMING';
    headerStatusText.style.color = '#00e5ff';
    ledBottom.className = 'pokedex-led led-bottom lit-amber';
  } else if (stage === 'retrieving') {
    ragStageLabel.textContent = 'RAG SCAN';
    ragStageLabel.style.color = '#00e676';
    ragFillBar.style.height = '50%';
    ragFillBar.style.backgroundColor = '#00e676';
    ragTelemetryText.textContent = 'VECTOR SEARCH';
    headerStatusText.textContent = 'RAG EXTRACTING...';
    ledTop.className = 'pokedex-led led-top pulsing-fast';
  } else if (stage === 'generating') {
    ragStageLabel.textContent = 'GENESIS';
    ragStageLabel.style.color = '#FFE81F';
    ragFillBar.style.height = '85%';
    ragFillBar.style.backgroundColor = '#FFE81F';
    ragTelemetryText.textContent = 'GROQ LLM';
    headerStatusText.textContent = 'GENERATING...';
  } else if (stage === 'done') {
    ragStageLabel.textContent = 'SYNCED';
    ragStageLabel.style.color = '#00e676';
    ragFillBar.style.height = '100%';
    ragFillBar.style.backgroundColor = '#00e676';
    ragTelemetryText.textContent = latencyMs ? `${latencyMs}ms` : 'DONE';
    ragTelemetryText.className = 'telemetry-text green';
    headerStatusText.textContent = 'RESPONSE READY';
    setTimeout(() => {
      if (!isListening && !isProcessing) setRagStage('idle');
    }, 3000);
  }
}

// -------------------------------------------------------------
// CHAT MESSAGE HELPERS (WhatsApp style with yellow text)
// -------------------------------------------------------------
function getCurrentTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'wa-message-row user-row';
  row.innerHTML = `
    <div class="wa-bubble wa-user-bubble">
      <div class="wa-bubble-tail tail-right"></div>
      <div class="wa-bubble-header">
        <span class="wa-sender-label">TRAINER</span>
      </div>
      <div class="wa-bubble-text">${escapeHtml(text)}</div>
      <div class="wa-bubble-footer">
        <span class="wa-timestamp">${getCurrentTime()}</span>
        <i data-lucide="check-check" class="wa-blue-ticks" style="width:14px;height:14px;"></i>
      </div>
    </div>
  `;
  chatViewport.appendChild(row);
  if (window.lucide) lucide.createIcons();
  chatViewport.scrollTop = chatViewport.scrollHeight;
}

function appendBobMessage(text, latency = null) {
  const row = document.createElement('div');
  row.className = 'wa-message-row bob-row';
  const totalMs = latency?.total ? `${latency.total}ms` : '';
  row.innerHTML = `
    <div class="wa-bubble wa-bob-bubble">
      <div class="wa-bubble-tail tail-left"></div>
      <div class="wa-bubble-header">
        <span class="wa-sender-label">BOB [POKÉDEX]</span>
      </div>
      <div class="wa-bubble-text yellow-rag-text">${escapeHtml(text)}</div>
      ${totalMs ? `<div class="wa-telemetry-badge"><span class="latency-tag">⚡ ${totalMs}</span></div>` : ''}
      <div class="wa-bubble-footer">
        <span class="wa-timestamp">${getCurrentTime()}</span>
      </div>
    </div>
  `;
  chatViewport.appendChild(row);
  chatViewport.scrollTop = chatViewport.scrollHeight;

  // Speak aloud
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.05;
    window.speechSynthesis.speak(utt);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// -------------------------------------------------------------
// SPEECH RECOGNITION & API BACKEND QUERY
// -------------------------------------------------------------
let recognition = null;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRec();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = function() {
    isListening = true;
    liveTranscript = '';
    rightWingLabel.textContent = 'LISTENING';
    blueStartBtn.classList.add('active-listening');
    setRagStage('listening');

    // Create live interim transcript bubble
    interimRowEl = document.createElement('div');
    interimRowEl.className = 'wa-message-row user-row';
    interimRowEl.innerHTML = `
      <div class="wa-bubble wa-user-bubble" style="border: 1.5px dashed #00e5ff;">
        <div class="wa-bubble-tail tail-right"></div>
        <div class="wa-bubble-header">
          <span class="wa-sender-label">TRAINER (SPEAKING...)</span>
        </div>
        <div class="wa-bubble-text live-speech-text" id="interim-text">Listening...</div>
        <div class="wa-bubble-footer">
          <span class="wa-timestamp">Live</span>
        </div>
      </div>
    `;
    chatViewport.appendChild(interimRowEl);
    chatViewport.scrollTop = chatViewport.scrollHeight;
  };

  recognition.onresult = function(event) {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    liveTranscript = final || interim;
    const el = document.getElementById('interim-text');
    if (el) el.textContent = liveTranscript || 'Listening...';
    chatViewport.scrollTop = chatViewport.scrollHeight;
  };

  recognition.onerror = function() {
    stopListening();
  };

  recognition.onend = function() {
    if (isListening) {
      const q = liveTranscript;
      stopListening();
      if (q && q.trim().length > 0) {
        submitQuery(q.trim());
      }
    }
  };
}

function startListening() {
  if (isListening || isProcessing) return;
  pokedexModal.classList.remove('hidden');
  if (recognition) {
    try { recognition.start(); } catch(e) {}
  }
}

function stopListening() {
  isListening = false;
  rightWingLabel.textContent = 'VOICE ORB';
  blueStartBtn.classList.remove('active-listening');
  if (interimRowEl && interimRowEl.parentNode) {
    interimRowEl.parentNode.removeChild(interimRowEl);
    interimRowEl = null;
  }
  if (recognition) {
    try { recognition.stop(); } catch(e) {}
  }
}

function toggleListening() {
  if (isListening) {
    const q = liveTranscript;
    stopListening();
    if (q && q.trim().length > 0) {
      submitQuery(q.trim());
    }
  } else {
    startListening();
  }
}

// Button click bindings
blueStartBtn.addEventListener('click', startListening);
dotmatrixBlobBtn.addEventListener('click', toggleListening);

// Spacebar Keybind
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    toggleListening();
  } else if (e.key === 'Escape') {
    pokedexModal.classList.add('hidden');
  }
});

// Chat Form submit
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text && !isProcessing) {
    chatInput.value = '';
    submitQuery(text);
  }
});

// Query Backend
async function submitQuery(queryText) {
  appendUserMessage(queryText);
  isProcessing = true;
  rightWingLabel.textContent = 'THINKING';
  setRagStage('retrieving');

  const startTime = performance.now();

  setTimeout(() => {
    setRagStage('generating');
  }, 120);

  const endpoints = [
    '/api/v1/text/query',
    'http://127.0.0.1:8000/api/v1/text/query',
    'http://localhost:8000/api/v1/text/query'
  ];

  let lastError = null;
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText, top_k: 3 }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const totalLatency = Math.round(performance.now() - startTime);
      setRagStage('done', totalLatency);
      appendBobMessage(data.answer || 'No answer found.', data.latency_ms || { total: totalLatency });
      isProcessing = false;
      rightWingLabel.textContent = 'VOICE ORB';
      return;
    } catch(err) {
      lastError = err;
    }
  }

  setRagStage('error');
  appendBobMessage(`Error: ${lastError ? lastError.message : 'Could not reach backend on :8000'}`);
  isProcessing = false;
  rightWingLabel.textContent = 'VOICE ORB';
}
