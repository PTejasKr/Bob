import { useEffect, useRef, useState } from 'react';

export function useVAD(onSilence: () => void) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);

  // Configuration
  const SILENCE_THRESHOLD = 0.02; // Volume threshold
  const SILENCE_DURATION = 1500; // ms of silence before triggering stop

  const startVAD = async (stream: MediaStream) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 512;
    analyserRef.current.smoothingTimeConstant = 0.8;

    sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
    sourceRef.current.connect(analyserRef.current);

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkVolume = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteTimeDomainData(dataArray);
      
      let sumSquares = 0.0;
      for (let i = 0; i < bufferLength; i++) {
        const norm = (dataArray[i] / 128.0) - 1.0;
        sumSquares += norm * norm;
      }
      
      const rms = Math.sqrt(sumSquares / bufferLength);

      if (rms > SILENCE_THRESHOLD) {
        setIsSpeaking(true);
        silenceStartRef.current = 0;
      } else {
        if (silenceStartRef.current === 0) {
          silenceStartRef.current = performance.now();
        } else if (performance.now() - silenceStartRef.current > SILENCE_DURATION) {
          if (isSpeaking) {
            setIsSpeaking(false);
            onSilence();
            return; // stop the loop
          }
        }
      }
      
      rafRef.current = requestAnimationFrame(checkVolume);
    };

    checkVolume();
  };

  const stopVAD = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) sourceRef.current.disconnect();
    setIsSpeaking(false);
    silenceStartRef.current = 0;
  };

  useEffect(() => {
    return stopVAD;
  }, []);

  return { startVAD, stopVAD, isSpeaking };
}
