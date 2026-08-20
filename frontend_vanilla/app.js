// Initialize Lucide Icons
lucide.createIcons();

// Elements
const micBtn = document.getElementById('mic-btn');
const micIcon = document.getElementById('mic-icon');
const recordStatus = document.getElementById('record-status');
const resultsContainer = document.getElementById('results-container');
const transcriptText = document.getElementById('transcript-text');
const answerText = document.getElementById('answer-text');
const metricRag = document.getElementById('metric-rag');
const metricLlm = document.getElementById('metric-llm');
const metricTotal = document.getElementById('metric-total');

const menuBtn = document.getElementById('menu-btn');
const closeMenuBtn = document.getElementById('close-menu-btn');
const menuOverlay = document.getElementById('menu-overlay');
const menuBackdrop = document.querySelector('.menu-backdrop');

// Three.js Background Setup
let scene, camera, renderer, particles;

function initThreeJS() {
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.001);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.z = 1000;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    
    // Create a sphere of particles
    for ( let i = 0; i < 3000; i ++ ) {
        const x = 2000 * Math.random() - 1000;
        const y = 2000 * Math.random() - 1000;
        const z = 2000 * Math.random() - 1000;
        vertices.push( x, y, z );
    }

    geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
    
    const material = new THREE.PointsMaterial({ 
        size: 3, 
        color: 0xF3EADD, 
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending
    });

    particles = new THREE.Points( geometry, material );
    scene.add( particles );

    window.addEventListener( 'resize', onWindowResize );
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
}

let targetRotationX = 0;
let targetRotationY = 0;
let isRecordingAnimation = false;

function animate() {
    requestAnimationFrame( animate );

    if (isRecordingAnimation) {
        particles.rotation.x += 0.01;
        particles.rotation.y += 0.01;
        particles.material.size = Math.random() * 5 + 3;
        particles.material.color.setHex(0xef4444); // red pulse
    } else {
        particles.rotation.x += 0.001;
        particles.rotation.y += 0.002;
        particles.material.size = 3;
        particles.material.color.setHex(0xF3EADD); // beige
    }

    renderer.render( scene, camera );
}

initThreeJS();

// Menu Toggle
function toggleMenu() {
    menuOverlay.classList.toggle('open');
}

menuBtn.addEventListener('click', toggleMenu);
closeMenuBtn.addEventListener('click', toggleMenu);
menuBackdrop.addEventListener('click', toggleMenu);

// Web Speech API Setup
let recognition;
let isRecording = false;

if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = function() {
        isRecording = true;
        isRecordingAnimation = true;
        micBtn.classList.add('recording');
        recordStatus.textContent = 'Listening...';
        
        // Hide results if showing
        resultsContainer.classList.add('hidden');
        transcriptText.textContent = '...';
        
        // Change icon to square (stop)
        micIcon.setAttribute('data-lucide', 'square');
        lucide.createIcons();
    };

    recognition.onresult = function(event) {
        let interim_transcript = '';
        let final_transcript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                final_transcript += event.results[i][0].transcript;
            } else {
                interim_transcript += event.results[i][0].transcript;
            }
        }
        
        // Instant visual feedback
        resultsContainer.classList.remove('hidden');
        if (final_transcript) {
            transcriptText.textContent = final_transcript;
        } else {
            transcriptText.textContent = interim_transcript;
        }
    };

    recognition.onerror = function(event) {
        console.error("Speech error", event.error);
        stopRecording();
        recordStatus.textContent = 'Error: ' + event.error;
    };

    recognition.onend = function() {
        if (!isRecording) return; // already stopped manually
        const finalQuery = transcriptText.textContent;
        stopRecording();
        
        if (finalQuery && finalQuery !== '...') {
            sendToBackend(finalQuery);
        }
    };
} else {
    recordStatus.textContent = 'Speech API not supported in this browser.';
    micBtn.disabled = true;
}

function startRecording() {
    try {
        recognition.start();
    } catch(e) {}
}

function stopRecording() {
    isRecording = false;
    isRecordingAnimation = false;
    micBtn.classList.remove('recording');
    recordStatus.textContent = 'Click to transcribe';
    
    // Change icon back to mic
    micIcon.setAttribute('data-lucide', 'mic');
    lucide.createIcons();
    
    try {
        recognition.stop();
    } catch(e) {}
}

micBtn.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
        // If they stopped it manually, trigger backend with what we have
        const finalQuery = transcriptText.textContent;
        if (finalQuery && finalQuery !== '...') {
            sendToBackend(finalQuery);
        }
    } else {
        startRecording();
    }
});

async function sendToBackend(query) {
    recordStatus.textContent = 'Searching...';
    micBtn.disabled = true;
    
    // Set UI to loading state
    answerText.innerHTML = '<span class="spinner" style="display:inline-block">🌀</span> Generating...';
    metricRag.textContent = '-';
    metricLlm.textContent = '-';
    metricTotal.textContent = '-';

    const startTime = performance.now();

    try {
        const response = await fetch('http://127.0.0.1:8080/api/v1/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        const endTime = performance.now();
        const totalLatency = Math.round(endTime - startTime);

        answerText.textContent = data.answer;
        
        // In the Go backend, we'll return these specific latencies
        metricRag.textContent = data.rag_latency_ms + 'ms';
        metricLlm.textContent = data.llm_latency_ms + 'ms';
        metricTotal.textContent = totalLatency + 'ms';
        
        recordStatus.textContent = 'Done!';
        
    } catch (error) {
        console.error(error);
        answerText.textContent = 'Failed to fetch response. Make sure Go backend is running on 8080.';
        recordStatus.textContent = 'Error';
    } finally {
        micBtn.disabled = false;
        setTimeout(() => {
            if (!isRecording) recordStatus.textContent = 'Click to transcribe';
        }, 3000);
    }
}
