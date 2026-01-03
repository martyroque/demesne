import { Store } from "nucleux";

const PIPER_URL = import.meta.env.VITE_PIPER_URL || "http://localhost:10201";

export interface PiperSynthesisOptions {
  text: string;
  voice?: string; // Optional voice selection (e.g., "en_US-lessac-medium")
}

class PiperService extends Store {
  public isSpeaking = this.atom(false);

  private audioContext: AudioContext | null = null;
  private isAvailable = this.atom(false);

  constructor() {
    super();
    this.checkAvailability();
  }

  private async checkAvailability() {
    try {
      const response = await fetch(`${PIPER_URL}/info`, {
        method: "GET",
      });
      this.isAvailable.value = response.ok;
    } catch (error) {
      console.warn("Piper service not available:", error);
      this.isAvailable.value = false;
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 22050 });
    }
    return this.audioContext;
  }

  /**
   * Convert PCM audio bytes to AudioBuffer
   * Piper outputs: 22050Hz sample rate, 16-bit, mono
   */
  private async pcmToAudioBuffer(pcmData: ArrayBuffer): Promise<AudioBuffer> {
    const audioContext = this.getAudioContext();

    const samples = new Int16Array(pcmData);
    const audioBuffer = audioContext.createBuffer(
      1, // mono
      samples.length,
      22050 // Piper default sample rate
    );

    // Convert Int16 to Float32 for AudioBuffer
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      // Normalize Int16 [-32768, 32767] to Float32 [-1.0, 1.0]
      channelData[i] = samples[i] / (samples[i] < 0 ? 0x8000 : 0x7fff);
    }

    return audioBuffer;
  }

  async synthesize(options: PiperSynthesisOptions): Promise<AudioBuffer> {
    if (!this.isAvailable.value) {
      throw new Error(
        "Piper service not available. Ensure Docker container is running."
      );
    }

    try {
      console.log(`PiperService | Synthesizing: "${options.text}"`);

      const response = await fetch(`${PIPER_URL}/synthesize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: options.text,
          voice: options.voice,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Piper API error: ${response.statusText} - ${errorText}`
        );
      }

      const pcmData = await response.arrayBuffer();

      console.log(
        `PiperService | Received ${pcmData.byteLength} bytes of audio`
      );

      const audioBuffer = await this.pcmToAudioBuffer(pcmData);

      console.log(
        `PiperService | Audio duration: ${audioBuffer.duration.toFixed(2)}s`
      );

      return audioBuffer;
    } catch (error) {
      console.error("Piper synthesis failed:", error);
      throw error;
    }
  }

  async speak(options: PiperSynthesisOptions): Promise<void> {
    if (!options.text.trim()) return;

    try {
      this.isSpeaking.value = true;
      const audioBuffer = await this.synthesize(options);
      await this.playAudio(audioBuffer);
    } catch (error) {
      console.error("TTS playback failed:", error);
    } finally {
      this.isSpeaking.value = false;
    }
  }

  async playAudio(audioBuffer: AudioBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const audioContext = this.getAudioContext();
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        source.onended = () => {
          console.log("PiperService | Audio playback finished");
          resolve();
        };

        source.start(0);
        console.log("PiperService | Playing audio...");
      } catch (error) {
        console.error("Audio playback failed:", error);
        reject(error);
      }
    });
  }

  stop() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isSpeaking.value = false;
  }
}

export default PiperService;
