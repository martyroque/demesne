import { Store } from "nucleux";

const WHISPER_URL =
  import.meta.env.VITE_WHISPER_URL || "http://localhost:10301";

export interface WhisperTranscription {
  text: string;
  language?: string;
  confidence?: number;
}

class WhisperService extends Store {
  private isAvailable = this.atom(false);

  constructor() {
    super();
    this.checkAvailability();
  }

  private async checkAvailability() {
    try {
      const response = await fetch(`${WHISPER_URL}/info`, {
        method: "GET",
      });
      this.isAvailable.value = response.ok;
    } catch (error) {
      console.warn("Whisper service not available:", error);
      this.isAvailable.value = false;
    }
  }

  /**
   * Convert audio blob to PCM format expected by Wyoming protocol
   * Whisper expects: 16kHz sample rate, 16-bit, mono channel
   */
  private async audioBlobToPCM(blob: Blob): Promise<ArrayBuffer> {
    console.log(
      `audioBlobToPCM | Input: ${blob.size} bytes, type: ${blob.type}`
    );

    const audioContext = new AudioContext({ sampleRate: 16000 });

    try {
      const arrayBuffer = await blob.arrayBuffer();
      console.log(
        `audioBlobToPCM | ArrayBuffer size: ${arrayBuffer.byteLength}`
      );

      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        console.log(
          `audioBlobToPCM | Decoded: ${audioBuffer.duration}s, ${audioBuffer.sampleRate}Hz, ${audioBuffer.numberOfChannels} channels`
        );
      } catch (decodeError) {
        console.error("Failed to decode audio:", decodeError);
        console.log(
          "Audio blob first 100 bytes:",
          new Uint8Array(arrayBuffer.slice(0, 100))
        );
        throw new Error(`Audio decoding failed. Format may be unsupported.`);
      }

      const channelData = this.getMonoChannelData(audioBuffer);
      console.log(
        `audioBlobToPCM | Mono channel: ${channelData.length} samples`
      );

      const pcmData = this.float32ToInt16(channelData);
      console.log(`audioBlobToPCM | PCM output: ${pcmData.byteLength} bytes`);

      return pcmData.buffer as ArrayBuffer;
    } finally {
      await audioContext.close();
    }
  }

  /**
   * Get mono channel data from audio buffer
   * If stereo, mix down to mono
   */
  private getMonoChannelData(audioBuffer: AudioBuffer): Float32Array {
    if (audioBuffer.numberOfChannels === 1) {
      return audioBuffer.getChannelData(0);
    }

    const length = audioBuffer.length;
    const mono = new Float32Array(length);
    const numChannels = audioBuffer.numberOfChannels;

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        mono[i] += channelData[i] / numChannels;
      }
    }

    return mono;
  }

  /**
   * Convert Float32 samples to Int16 PCM
   */
  private float32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);

    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] range
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit integer
      int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    return int16Array;
  }

  async transcribe(audioBlob: Blob): Promise<WhisperTranscription> {
    if (!this.isAvailable.value) {
      throw new Error(
        "Whisper service not available. Ensure Docker container is running."
      );
    }

    try {
      console.log(
        `WhisperService | Converting audio blob (${audioBlob.size} bytes, ${audioBlob.type})`
      );

      const pcmBuffer = await this.audioBlobToPCM(audioBlob);

      console.log(
        `WhisperService | Converted to PCM (${pcmBuffer.byteLength} bytes)`
      );

      const response = await fetch(`${WHISPER_URL}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "audio/pcm",
        },
        body: pcmBuffer,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Whisper API error: ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();

      console.log(`WhisperService | Transcription: "${result.text}"`);

      return {
        text: result.text || "",
        language: result.language,
      };
    } catch (error) {
      console.error("Whisper transcription failed:", error);
      throw error;
    }
  }
}

export default WhisperService;
