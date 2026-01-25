import { Store } from "nucleux";
import WhisperService from "../whisper";

const SupportedMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

const SILENCE_THRESHOLD = 10;
const SILENCE_DURATION_MS = 1500;

class MediaRecorderService extends Store {
  public isRecording = this.atom(false);
  public isProcessing = this.atom(false);
  public recordingTime = this.atom(0);
  public error = this.atom<string | null>(null);

  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private mediaTimer: number | null = null;
  private silenceTimer: number | null = null;
  private lastAudioTime = 0;

  private whisperService = this.inject(WhisperService);

  async startRecording(onTranscript: (text: string) => void) {
    try {
      this.error.value = null;
      this.audioChunks = [];
      this.recordingTime.value = 0;

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono
          sampleRate: 16000, // 16kHz for Whisper
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      let mimeType = "";
      for (const type of SupportedMimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          console.log(`Using mimeType: ${mimeType}`);
          break;
        }
      }

      if (!mimeType) {
        throw new Error("No supported audio format found");
      }

      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isRecording.value = false;
        if (this.mediaTimer) {
          clearInterval(this.mediaTimer);
        }

        if (this.audioChunks.length === 0) {
          this.error.value = "No audio recorded";
          return;
        }

        this.isProcessing.value = true;

        try {
          const audioBlob = new Blob(this.audioChunks, {
            type: mimeType || "audio/webm",
          });

          console.log(
            `Audio recorded: ${audioBlob.size} bytes, ${this.recordingTime.value}s`
          );

          const result = await this.whisperService.transcribe(audioBlob);

          if (result.text.trim()) {
            onTranscript(result.text.trim());
          } else {
            this.error.value = "No speech detected";
          }
        } catch (err) {
          console.error("Transcription error:", err);
          this.error.value =
            err instanceof Error ? err.message : "Transcription failed";
        } finally {
          this.isProcessing.value = false;
          this.audioChunks = [];
        }
      };

      this.mediaRecorder.start();
      this.isRecording.value = true;

      this.mediaTimer = setInterval(() => {
        this.recordingTime.value += 0.1;
      }, 100);
    } catch (err) {
      console.error("Failed to start recording:", err);
      this.error.value =
        err instanceof Error
          ? err.message
          : "Microphone access denied or unavailable";
    }
  }

  stopRecording() {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.mediaTimer) {
      clearInterval(this.mediaTimer);
    }

    console.log("Recording stopped");
  }

  startSilenceDetection() {
    if (!this.mediaStream) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(this.mediaStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    this.lastAudioTime = Date.now();

    this.silenceTimer = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average =
        dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

      if (average > SILENCE_THRESHOLD) {
        // User is speaking - reset silence timer
        this.lastAudioTime = Date.now();
      } else {
        const silenceDuration = Date.now() - this.lastAudioTime;
        if (silenceDuration > SILENCE_DURATION_MS) {
          console.log("Auto-stopping: User stopped speaking");
          this.stopRecording();
          audioContext.close();
        }
      }
    }, 100); // Check every 100ms
  }

  destroy(): void {
    this.stopRecording();
    super.destroy();
  }
}

export default MediaRecorderService;
