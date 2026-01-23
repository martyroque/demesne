import { useRef, type RefObject } from "react";

const SILENCE_THRESHOLD = 10;
const SILENCE_DURATION_MS = 1500;

export function useSilenceDetection(
  streamRef: RefObject<MediaStream | null>,
  mediaRecorderRef: RefObject<MediaRecorder | null>,
  autoActivatedRef: RefObject<boolean>
) {
  const silenceTimerRef = useRef<number | null>(null);
  const lastAudioTimeRef = useRef<number>(0);

  // TODO: move this to audio service/hook
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const startSilenceDetection = () => {
    if (!streamRef.current || !autoActivatedRef.current) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(streamRef.current);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    lastAudioTimeRef.current = Date.now();

    silenceTimerRef.current = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average =
        dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

      if (average > SILENCE_THRESHOLD) {
        // User is speaking - reset silence timer
        lastAudioTimeRef.current = Date.now();
      } else {
        const silenceDuration = Date.now() - lastAudioTimeRef.current;
        if (silenceDuration > SILENCE_DURATION_MS) {
          console.log("Auto-stopping: User stopped speaking");
          stopRecording();
          audioContext.close();
        }
      }
    }, 100); // Check every 100ms
  };

  return { startSilenceDetection, stopRecording };
}
