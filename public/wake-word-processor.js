/**
 * Wake Word Audio Processor
 * Runs in AudioWorkletGlobalScope (audio rendering thread)
 *
 * This file:
 * - Accumulates audio samples into 1-second chunks
 * - Converts Float32 to Int16 PCM format
 * - Sends chunks to main thread for wake word detection
 */

class WakeWordProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const durationSeconds = options?.processorOptions?.bufferSeconds || 1.5;
    this.bufferSize = Math.floor(16000 * durationSeconds);
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;

    console.log("[WakeWordProcessor] Initialized - Sample rate:", sampleRate);
    console.log(`[WakeWordProcessor] Buffer: ${durationSeconds}s`);
  }

  /**
   * Process audio chunks
   * Called automatically by the audio rendering thread
   *
   * @param {Float32Array[][]} inputs - Input audio buffers [input][channel][samples]
   * @param {Float32Array[][]} outputs - Output audio buffers (unused)
   * @param {Object} parameters - AudioParam values (unused)
   * @returns {boolean} - true to keep processor alive
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];

    // Only process if we have input audio
    if (input && input.length > 0) {
      const inputChannel = input[0]; // Mono channel

      // Accumulate samples into buffer
      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex++] = inputChannel[i];

        // When buffer is full, send to main thread
        if (this.bufferIndex >= this.bufferSize) {
          this.sendChunkToMainThread();
          this.bufferIndex = 0; // Reset for next chunk
        }
      }
    }

    // Return true to keep processor alive
    // Returning false would stop the processor
    return true;
  }

  /**
   * Convert Float32 buffer to Int16 PCM and send to main thread
   */
  sendChunkToMainThread() {
    // Convert Float32Array [-1.0, 1.0] to Int16Array [-32768, 32767]
    const int16Buffer = new Int16Array(this.bufferSize);

    for (let i = 0; i < this.bufferSize; i++) {
      // Clamp sample to valid range
      const sample = Math.max(-1, Math.min(1, this.buffer[i]));

      // Convert to 16-bit integer
      int16Buffer[i] =
        sample < 0
          ? sample * 0x8000 // Negative: -32768
          : sample * 0x7fff; // Positive: 32767
    }

    // Send to main thread via MessagePort
    // Transfer ownership of buffer for performance (zero-copy)
    this.port.postMessage(
      {
        type: "audio-chunk",
        data: int16Buffer.buffer,
        timestamp: currentTime,
        frame: currentFrame,
      },
      [int16Buffer.buffer] // Transferable - gives ownership to main thread
    );
  }
}

registerProcessor("wake-word-processor", WakeWordProcessor);

console.log("[WakeWordProcessor] Registered successfully");
