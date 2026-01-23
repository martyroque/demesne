import { Store } from "nucleux";

const WAKEWORD_URL =
  import.meta.env.VITE_WAKEWORD_URL || "http://localhost:10401";

export interface WakeWordDetection {
  detected: boolean;
  wakeword: string;
  timestamp: number;
}

class WakeWordService extends Store {
  public isListening = this.atom(false);
  public isDetectionActive = this.atom(false);
  private isAvailable = this.atom(false);

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private onDetectionCallback: ((detection: WakeWordDetection) => void) | null =
    null;

  constructor() {
    super();
    this.checkAvailability();
  }

  private async checkAvailability() {
    try {
      const response = await fetch(`${WAKEWORD_URL}/info`, {
        method: "GET",
      });
      this.isAvailable.value = response.ok;
    } catch (error) {
      console.warn("Wake word service not available:", error);
      this.isAvailable.value = false;
    }
  }

  async startDetection(
    onDetection: (detection: WakeWordDetection) => void
  ): Promise<void> {
    await this.checkAvailability();
    if (!this.isAvailable.value) {
      throw new Error(
        "Wake word service not available. Ensure Docker container is running."
      );
    }

    if (this.isDetectionActive.value) {
      console.warn("Wake word detection already active");
      return;
    }

    this.onDetectionCallback = onDetection;

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono
          sampleRate: 16000, // 16kHz for wake word detection
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Create audio context at 16kHz
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );

      // Load the AudioWorklet processor
      await this.audioContext.audioWorklet.addModule(
        "/wake-word-processor.js?v=" + Date.now()
      );

      // Create the worklet node
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "wake-word-processor",
        {
          processorOptions: {
            bufferSeconds: 2,
          },
        }
      );

      // Listen for audio chunks from the processor
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === "audio-chunk") {
          // Send audio chunk to wake word detection service
          this.detectWakeWord(event.data.data);
        }
      };

      // Connect audio graph: microphone → processor → destination
      source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);

      this.isDetectionActive.value = true;
      this.isListening.value = true;

      console.log("Wake word detection started (AudioWorklet)");
    } catch (error) {
      console.error("Failed to start wake word detection:", error);
      this.stopDetection();
      throw error;
    }
  }

  stopDetection(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.isDetectionActive.value = false;
    this.isListening.value = false;
    this.onDetectionCallback = null;

    console.log("Wake word detection stopped");
  }

  private async detectWakeWord(pcmData: ArrayBuffer): Promise<void> {
    try {
      const response = await fetch(`${WAKEWORD_URL}/detect`, {
        method: "POST",
        headers: {
          "Content-Type": "audio/pcm",
        },
        body: pcmData,
      });

      if (!response.ok) {
        console.error("Wake word detection request failed:", response.status);
        return;
      }

      const result = await response.json();

      console.log("Wake word result:", result);

      if (result.detected && this.onDetectionCallback) {
        console.log(`Wake word detected: "${result.wakeword}"`);

        this.onDetectionCallback({
          detected: true,
          wakeword: result.wakeword,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error("Wake word detection error:", error);
    }
  }

  async toggleDetection(
    onDetection: (detection: WakeWordDetection) => void
  ): Promise<void> {
    if (this.isDetectionActive.value) {
      this.stopDetection();
    } else {
      await this.startDetection(onDetection);
    }
  }
}

export default WakeWordService;
