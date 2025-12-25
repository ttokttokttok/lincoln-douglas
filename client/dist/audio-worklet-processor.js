/**
 * PCM Audio Processor - AudioWorklet for real-time audio capture
 * 
 * This processor captures audio from the microphone, downsamples it from
 * the browser's native sample rate (typically 48kHz) to 16kHz, and converts
 * it to 16-bit PCM format suitable for Google Cloud Speech-to-Text.
 */

class PCMAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Buffer to accumulate samples before sending
    // At 16kHz, 1600 samples = 100ms of audio
    this.bufferSize = 1600;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    // Track if we're actively streaming
    this.isStreaming = false;
    
    // Handle messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'start') {
        this.isStreaming = true;
        this.bufferIndex = 0;
      } else if (event.data.type === 'stop') {
        this.isStreaming = false;
        // Flush any remaining buffer
        if (this.bufferIndex > 0) {
          this.sendBuffer(this.bufferIndex);
          this.bufferIndex = 0;
        }
      }
    };
  }

  /**
   * Downsample audio from source sample rate to target sample rate
   * Uses simple linear interpolation for quality
   */
  downsample(inputBuffer, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
      return inputBuffer;
    }
    
    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.floor(inputBuffer.length / ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputBuffer.length - 1);
      const fraction = srcIndex - srcIndexFloor;
      
      // Linear interpolation
      output[i] = inputBuffer[srcIndexFloor] * (1 - fraction) + 
                  inputBuffer[srcIndexCeil] * fraction;
    }
    
    return output;
  }

  /**
   * Convert Float32 samples (-1 to 1) to 16-bit PCM integers
   */
  floatTo16BitPCM(float32Array) {
    const pcm = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] range
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit integer
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm;
  }

  /**
   * Send buffered audio data to main thread
   */
  sendBuffer(length) {
    // Get only the filled portion of the buffer
    const audioData = this.buffer.slice(0, length);
    
    // Convert to 16-bit PCM
    const pcmData = this.floatTo16BitPCM(audioData);
    
    // Send to main thread
    this.port.postMessage({
      type: 'audio',
      audioData: pcmData.buffer,
      timestamp: currentTime,
    }, [pcmData.buffer]); // Transfer ownership for performance
  }

  /**
   * Process audio frames
   * Called ~344 times/second at 48kHz with 128-sample frames
   */
  process(inputs, outputs, parameters) {
    // Get first input channel (mono)
    const input = inputs[0];
    if (!input || input.length === 0 || !this.isStreaming) {
      return true;
    }
    
    const inputChannel = input[0];
    if (!inputChannel || inputChannel.length === 0) {
      return true;
    }
    
    // Downsample from browser sample rate (typically 48kHz) to 16kHz
    const downsampled = this.downsample(inputChannel, sampleRate, 16000);
    
    // Accumulate into buffer
    for (let i = 0; i < downsampled.length; i++) {
      this.buffer[this.bufferIndex++] = downsampled[i];
      
      // When buffer is full, send it
      if (this.bufferIndex >= this.bufferSize) {
        this.sendBuffer(this.bufferSize);
        this.bufferIndex = 0;
      }
    }
    
    return true; // Keep processor alive
  }
}

registerProcessor('pcm-audio-processor', PCMAudioProcessor);

