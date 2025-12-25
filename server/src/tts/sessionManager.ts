/**
 * TTS Session Manager
 *
 * Manages TTS sessions per participant, including:
 * - Voice selection per participant
 * - TTS request queuing (to prevent overlapping audio)
 * - Session lifecycle management
 */

import { LanguageCode, TTSRequest, EmotionMarkers } from '@shared/types';
import { elevenLabsTTS } from './elevenLabsTts';

interface TTSSession {
  participantId: string;
  roomId: string;
  voiceId: string;
  isGenerating: boolean;
  queue: QueuedTTSRequest[];
  createdAt: number;
}

interface QueuedTTSRequest {
  request: TTSRequest;
  speechId: string;
  onChunk: (chunk: Buffer, index: number) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

class TTSSessionManager {
  private sessions: Map<string, TTSSession> = new Map();
  private participantVoices: Map<string, string> = new Map();  // participantId -> voiceId

  /**
   * Create a TTS session for a participant
   */
  createSession(participantId: string, roomId: string, voiceId: string): void {
    // End any existing session
    this.endSession(participantId);

    this.sessions.set(participantId, {
      participantId,
      roomId,
      voiceId,
      isGenerating: false,
      queue: [],
      createdAt: Date.now(),
    });

    this.participantVoices.set(participantId, voiceId);
    console.log(`[TTSSession] Created session for ${participantId} with voice ${voiceId}`);
  }

  /**
   * Get the voice ID for a participant
   */
  getVoiceForParticipant(participantId: string): string | undefined {
    return this.participantVoices.get(participantId);
  }

  /**
   * Set the voice for a participant (updates both session and mapping)
   */
  setVoiceForParticipant(participantId: string, voiceId: string): void {
    this.participantVoices.set(participantId, voiceId);

    const session = this.sessions.get(participantId);
    if (session) {
      session.voiceId = voiceId;
      console.log(`[TTSSession] Updated voice for ${participantId} to ${voiceId}`);
    }
  }

  /**
   * Get or create a session for a participant
   */
  getOrCreateSession(participantId: string, roomId: string, language: LanguageCode): TTSSession {
    let session = this.sessions.get(participantId);

    if (!session) {
      // Get voice from mapping or default
      let voiceId = this.participantVoices.get(participantId);

      if (!voiceId) {
        // Use default voice for language
        const defaultVoice = elevenLabsTTS.getDefaultVoice(language);
        voiceId = defaultVoice?.voiceId || elevenLabsTTS.getPresetVoices('en')[0]?.voiceId || '';
      }

      this.createSession(participantId, roomId, voiceId);
      session = this.sessions.get(participantId)!;
    }

    return session;
  }

  /**
   * Check if a session exists for a participant
   */
  hasSession(participantId: string): boolean {
    return this.sessions.has(participantId);
  }

  /**
   * Get session for a participant
   */
  getSession(participantId: string): TTSSession | undefined {
    return this.sessions.get(participantId);
  }

  /**
   * Queue a TTS request for a participant
   * Requests are processed sequentially to prevent audio overlap
   */
  async queueTTS(
    participantId: string,
    roomId: string,
    speechId: string,
    request: TTSRequest,
    onChunk: (chunk: Buffer, index: number) => void,
    onComplete: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    const session = this.getOrCreateSession(participantId, roomId, request.targetLanguage);

    // Add to queue
    session.queue.push({
      request,
      speechId,
      onChunk,
      onComplete,
      onError: onError || ((err) => console.error(`[TTSSession] Error for ${participantId}:`, err)),
    });

    console.log(`[TTSSession] Queued TTS for ${participantId}, queue length: ${session.queue.length}`);

    // Process queue if not already processing
    if (!session.isGenerating) {
      await this.processQueue(session);
    }
  }

  /**
   * Process the TTS queue for a session
   */
  private async processQueue(session: TTSSession): Promise<void> {
    if (session.isGenerating || session.queue.length === 0) {
      return;
    }

    session.isGenerating = true;
    const queuedRequest = session.queue.shift()!;
    let chunkIndex = 0;

    console.log(`[TTSSession] Processing TTS for ${session.participantId}, speech: ${queuedRequest.speechId}`);

    try {
      await elevenLabsTTS.generateStream({
        text: queuedRequest.request.text,
        voiceId: session.voiceId,
        voiceSettings: queuedRequest.request.emotionHints
          ? elevenLabsTTS.mapEmotionToSettings(queuedRequest.request.emotionHints)
          : undefined,
        onChunk: (chunk) => {
          queuedRequest.onChunk(chunk, chunkIndex++);
        },
        onComplete: () => {
          console.log(`[TTSSession] TTS complete for ${session.participantId}, chunks: ${chunkIndex}`);
          session.isGenerating = false;
          queuedRequest.onComplete();

          // Process next in queue
          this.processQueue(session);
        },
        onError: (error) => {
          console.error(`[TTSSession] TTS error for ${session.participantId}:`, error);
          session.isGenerating = false;
          queuedRequest.onError(error);

          // Try next in queue despite error
          this.processQueue(session);
        },
      });
    } catch (error) {
      console.error(`[TTSSession] Unexpected error for ${session.participantId}:`, error);
      session.isGenerating = false;
      queuedRequest.onError(error as Error);

      // Try next in queue
      this.processQueue(session);
    }
  }

  /**
   * Clear the queue for a participant (e.g., when speech ends prematurely)
   */
  clearQueue(participantId: string): void {
    const session = this.sessions.get(participantId);
    if (session) {
      const clearedCount = session.queue.length;
      session.queue = [];
      console.log(`[TTSSession] Cleared ${clearedCount} queued requests for ${participantId}`);
    }
  }

  /**
   * End a TTS session
   */
  endSession(participantId: string): void {
    const session = this.sessions.get(participantId);
    if (session) {
      // Clear any pending requests
      this.clearQueue(participantId);
      this.sessions.delete(participantId);
      console.log(`[TTSSession] Ended session for ${participantId}`);
    }
  }

  /**
   * End all sessions for a room
   */
  endRoomSessions(roomId: string): void {
    const sessionsToEnd: string[] = [];

    for (const [participantId, session] of this.sessions) {
      if (session.roomId === roomId) {
        sessionsToEnd.push(participantId);
      }
    }

    for (const participantId of sessionsToEnd) {
      this.endSession(participantId);
    }

    console.log(`[TTSSession] Ended ${sessionsToEnd.length} sessions for room ${roomId}`);
  }

  /**
   * Get all sessions for a room
   */
  getRoomSessions(roomId: string): TTSSession[] {
    const roomSessions: TTSSession[] = [];

    for (const session of this.sessions.values()) {
      if (session.roomId === roomId) {
        roomSessions.push(session);
      }
    }

    return roomSessions;
  }

  /**
   * Get statistics about current sessions
   */
  getStats(): { totalSessions: number; activeSessions: number; totalQueued: number } {
    let activeSessions = 0;
    let totalQueued = 0;

    for (const session of this.sessions.values()) {
      if (session.isGenerating) activeSessions++;
      totalQueued += session.queue.length;
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      totalQueued,
    };
  }

  /**
   * Check if TTS is currently generating for a participant
   */
  isGenerating(participantId: string): boolean {
    return this.sessions.get(participantId)?.isGenerating || false;
  }

  /**
   * Get the queue length for a participant
   */
  getQueueLength(participantId: string): number {
    return this.sessions.get(participantId)?.queue.length || 0;
  }
}

// Export singleton instance
export const ttsSessionManager = new TTSSessionManager();
