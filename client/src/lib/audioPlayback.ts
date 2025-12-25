/**
 * AudioPlaybackManager
 *
 * Handles TTS audio playback in the browser using Web Audio API.
 * Receives MP3 chunks from WebSocket, decodes them, and plays them smoothly.
 *
 * IMPORTANT: MP3 streaming fix
 * MP3 audio is frame-based (~26ms per frame). Decoding arbitrary chunks
 * causes "cuts" at frame boundaries. Solution: accumulate all chunks
 * and decode the complete audio once the stream ends.
 *
 * Features:
 * - Chunk accumulation for seamless playback (no frame boundary issues)
 * - Pre-buffering to reduce latency while maintaining quality
 * - Independent volume control
 * - Multiple speaker support
 */

interface AccumulatedAudio {
  chunks: ArrayBuffer[];
  totalBytes: number;
  firstChunkTime: number;
  isComplete: boolean;
}

interface SpeakerPlaybackState {
  accumulated: AccumulatedAudio;
  isPlaying: boolean;
  currentSource: AudioBufferSourceNode | null;
  playbackStarted: boolean;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentSpeakerId: string | null;
  volume: number;
  bufferedChunks: number;
}

class AudioPlaybackManager {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private speakerStates: Map<string, SpeakerPlaybackState> = new Map();
  private volume: number = 1.0;
  private isInitialized: boolean = false;

  /**
   * Initialize the audio context (must be called after user interaction)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.audioContext) {
      // Resume if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      return;
    }

    try {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.volume;

      // Resume context if suspended (browsers require user interaction)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.isInitialized = true;
      console.log('[AudioPlayback] Initialized, sample rate:', this.audioContext.sampleRate);
    } catch (error) {
      console.error('[AudioPlayback] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Check if the manager is ready for playback
   */
  isReady(): boolean {
    return this.isInitialized && this.audioContext !== null && this.audioContext.state === 'running';
  }

  /**
   * Queue an audio chunk for playback
   * Chunks are accumulated and decoded together to avoid MP3 frame boundary issues
   */
  async queueChunk(
    speakerId: string,
    _chunkIndex: number,
    base64Audio: string,
    isFinal: boolean
  ): Promise<void> {
    // Initialize on first chunk if needed
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Decode base64 to ArrayBuffer
    const audioData = this.base64ToArrayBuffer(base64Audio);

    // Get or create speaker state
    let speakerState = this.speakerStates.get(speakerId);
    if (!speakerState) {
      speakerState = {
        accumulated: {
          chunks: [],
          totalBytes: 0,
          firstChunkTime: Date.now(),
          isComplete: false,
        },
        isPlaying: false,
        currentSource: null,
        playbackStarted: false,
      };
      this.speakerStates.set(speakerId, speakerState);
    }

    // Accumulate the chunk
    speakerState.accumulated.chunks.push(audioData);
    speakerState.accumulated.totalBytes += audioData.byteLength;

    // If this is the final chunk, mark complete and trigger playback
    if (isFinal) {
      speakerState.accumulated.isComplete = true;
      await this.playAccumulated(speakerId);
    }
  }

  /**
   * Signal that TTS stream has ended - trigger playback of accumulated audio
   */
  async finishAccumulation(speakerId: string): Promise<void> {
    const speakerState = this.speakerStates.get(speakerId);
    if (speakerState && !speakerState.accumulated.isComplete) {
      speakerState.accumulated.isComplete = true;
      await this.playAccumulated(speakerId);
    }
  }

  /**
   * Play all accumulated audio chunks as a single buffer
   */
  private async playAccumulated(speakerId: string): Promise<void> {
    const speakerState = this.speakerStates.get(speakerId);
    if (!speakerState || !this.audioContext || !this.gainNode) {
      return;
    }

    // Don't play if already playing or no data
    if (speakerState.playbackStarted || speakerState.accumulated.chunks.length === 0) {
      return;
    }

    speakerState.playbackStarted = true;
    speakerState.isPlaying = true;

    try {
      // Combine all chunks into one buffer
      const combinedBuffer = this.combineChunks(speakerState.accumulated.chunks);

      console.log(`[AudioPlayback] Decoding ${combinedBuffer.byteLength} bytes of accumulated audio`);

      // Decode the complete MP3 as one unit - no frame boundary issues!
      const audioBuffer = await this.audioContext.decodeAudioData(combinedBuffer);

      // Create and play source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      speakerState.currentSource = source;

      // Play immediately
      source.start(0);

      const duration = audioBuffer.duration;
      console.log(`[AudioPlayback] Playing ${duration.toFixed(2)}s of audio for ${speakerId}`);

      // Cleanup when done - IMPORTANT: Reset ALL state so next TTS can play
      source.onended = () => {
        speakerState.currentSource = null;
        speakerState.isPlaying = false;
        speakerState.playbackStarted = false;  // Reset so next TTS can play!
        // Clear accumulated chunks so they don't interfere with next TTS
        speakerState.accumulated = {
          chunks: [],
          totalBytes: 0,
          firstChunkTime: 0,
          isComplete: false,
        };
        console.log(`[AudioPlayback] Playback complete for ${speakerId}, state reset`);
      };

    } catch (error) {
      console.error('[AudioPlayback] Error decoding accumulated audio:', error);
      // Reset ALL state on error so next TTS can try
      speakerState.isPlaying = false;
      speakerState.playbackStarted = false;
      speakerState.accumulated = {
        chunks: [],
        totalBytes: 0,
        firstChunkTime: 0,
        isComplete: false,
      };
    }
  }

  /**
   * Combine multiple ArrayBuffers into one
   */
  private combineChunks(chunks: ArrayBuffer[]): ArrayBuffer {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combined = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of chunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    return combined.buffer;
  }


  /**
   * Set playback volume (0.0 - 1.0)
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      // Use exponential ramp for smoother volume changes
      this.gainNode.gain.setTargetAtTime(
        this.volume,
        this.audioContext?.currentTime || 0,
        0.1
      );
    }
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Stop playback for a specific speaker
   */
  stop(speakerId: string): void {
    const speakerState = this.speakerStates.get(speakerId);
    if (speakerState) {
      // Stop current source if playing
      if (speakerState.currentSource) {
        try {
          speakerState.currentSource.stop();
        } catch {
          // Ignore errors if already stopped
        }
        speakerState.currentSource = null;
      }
      // Clear accumulated audio
      speakerState.accumulated = {
        chunks: [],
        totalBytes: 0,
        firstChunkTime: 0,
        isComplete: false,
      };
      speakerState.isPlaying = false;
      speakerState.playbackStarted = false;
    }
  }

  /**
   * Stop all playback
   */
  stopAll(): void {
    for (const speakerId of this.speakerStates.keys()) {
      this.stop(speakerId);
    }
    this.speakerStates.clear();
  }

  /**
   * Get playback state for a speaker
   */
  getState(speakerId: string): PlaybackState {
    const speakerState = this.speakerStates.get(speakerId);
    return {
      isPlaying: speakerState?.isPlaying || false,
      currentSpeakerId: speakerId,
      volume: this.volume,
      bufferedChunks: speakerState?.accumulated.chunks.length || 0,
    };
  }

  /**
   * Check if any speaker is currently playing
   */
  isAnyPlaying(): boolean {
    for (const state of this.speakerStates.values()) {
      if (state.isPlaying) return true;
    }
    return false;
  }

  /**
   * Get the currently playing speaker ID
   */
  getActiveSpeakerId(): string | null {
    for (const [speakerId, state] of this.speakerStates.entries()) {
      if (state.isPlaying) return speakerId;
    }
    return null;
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopAll();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.gainNode = null;
    this.isInitialized = false;
  }
}

// Export singleton instance
export const audioPlaybackManager = new AudioPlaybackManager();
