/**
 * AudioPlaybackManager
 *
 * Handles TTS audio playback in the browser using Web Audio API.
 * Receives MP3 chunks from WebSocket, decodes them, and plays them smoothly.
 *
 * Features:
 * - Chunk queuing for smooth playback
 * - Gapless audio between chunks
 * - Independent volume control
 * - Multiple speaker support
 */

interface AudioChunk {
  chunkIndex: number;
  audioData: ArrayBuffer;
  timestamp: number;
}

interface SpeakerPlaybackState {
  queue: AudioChunk[];
  isPlaying: boolean;
  nextPlayTime: number;
  currentSource: AudioBufferSourceNode | null;
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
   */
  async queueChunk(
    speakerId: string,
    chunkIndex: number,
    base64Audio: string,
    _isFinal: boolean
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
        queue: [],
        isPlaying: false,
        nextPlayTime: this.audioContext!.currentTime,
        currentSource: null,
      };
      this.speakerStates.set(speakerId, speakerState);
    }

    // Add chunk to queue
    speakerState.queue.push({
      chunkIndex,
      audioData,
      timestamp: Date.now(),
    });

    // Sort by chunk index to handle out-of-order delivery
    speakerState.queue.sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Start playback if not already playing
    if (!speakerState.isPlaying) {
      this.playNext(speakerId);
    }
  }

  /**
   * Play the next chunk in the queue for a speaker
   */
  private async playNext(speakerId: string): Promise<void> {
    const speakerState = this.speakerStates.get(speakerId);
    if (!speakerState || speakerState.queue.length === 0 || !this.audioContext || !this.gainNode) {
      if (speakerState) {
        speakerState.isPlaying = false;
      }
      return;
    }

    speakerState.isPlaying = true;
    const chunk = speakerState.queue.shift()!;

    try {
      // Decode MP3 to PCM
      const audioBuffer = await this.audioContext.decodeAudioData(
        chunk.audioData.slice(0)  // Clone buffer as decodeAudioData detaches it
      );

      // Create source node
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      // Schedule playback
      // Use slight overlap prevention: ensure we don't schedule in the past
      const now = this.audioContext.currentTime;
      const playTime = Math.max(speakerState.nextPlayTime, now);

      source.start(playTime);
      speakerState.currentSource = source;

      // Schedule next chunk after this one finishes
      speakerState.nextPlayTime = playTime + audioBuffer.duration;

      // When this chunk ends, play the next one
      source.onended = () => {
        speakerState.currentSource = null;
        this.playNext(speakerId);
      };

    } catch (error) {
      console.error('[AudioPlayback] Error decoding/playing chunk:', error);
      // Try next chunk on error
      speakerState.isPlaying = false;
      if (speakerState.queue.length > 0) {
        this.playNext(speakerId);
      }
    }
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
      // Clear queue
      speakerState.queue = [];
      speakerState.isPlaying = false;
      speakerState.nextPlayTime = this.audioContext?.currentTime || 0;
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
      bufferedChunks: speakerState?.queue.length || 0,
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
