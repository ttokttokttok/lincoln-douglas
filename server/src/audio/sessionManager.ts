/**
 * Audio Session Manager
 * 
 * Manages audio streaming sessions for each debater.
 * In Phase 1, this just tracks sessions and logs chunks.
 * In Phase 2-3, this will integrate with Google STT and translation services.
 */

import type { LanguageCode, SpeechRole } from '@shared/types';

export interface AudioSession {
  sessionId: string;
  roomId: string;
  participantId: string;
  speechId: string;
  language: LanguageCode;
  startedAt: number;
  chunksReceived: number;
  totalBytesReceived: number;
  isActive: boolean;
}

// Callbacks for when we process audio (will be used by STT in later phases)
export interface AudioSessionCallbacks {
  onSessionStart?: (session: AudioSession) => void;
  onAudioChunk?: (session: AudioSession, audioData: Buffer) => void;
  onSessionEnd?: (session: AudioSession) => void;
}

class AudioSessionManager {
  private sessions: Map<string, AudioSession> = new Map();
  private callbacks: AudioSessionCallbacks = {};

  /**
   * Set callbacks for audio processing
   * Will be used to integrate with STT service
   */
  setCallbacks(callbacks: AudioSessionCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Start a new audio session for a participant
   */
  startSession(
    roomId: string,
    participantId: string,
    speechId: string,
    language: LanguageCode
  ): AudioSession {
    // End any existing session for this participant
    this.endSession(participantId);

    const session: AudioSession = {
      sessionId: `${participantId}-${Date.now()}`,
      roomId,
      participantId,
      speechId,
      language,
      startedAt: Date.now(),
      chunksReceived: 0,
      totalBytesReceived: 0,
      isActive: true,
    };

    this.sessions.set(participantId, session);

    console.log(`[AudioSession] Started session for ${participantId} in ${roomId}, speech: ${speechId}, lang: ${language}`);

    this.callbacks.onSessionStart?.(session);

    return session;
  }

  /**
   * Process an audio chunk from a participant
   */
  processChunk(participantId: string, audioData: Buffer): boolean {
    const session = this.sessions.get(participantId);
    
    if (!session || !session.isActive) {
      console.warn(`[AudioSession] No active session for ${participantId}`);
      return false;
    }

    session.chunksReceived++;
    session.totalBytesReceived += audioData.length;

    // Log every 10 chunks (roughly every second at 100ms chunks)
    if (session.chunksReceived % 10 === 0) {
      console.log(`[AudioSession] ${participantId}: ${session.chunksReceived} chunks, ${(session.totalBytesReceived / 1024).toFixed(1)}KB total`);
    }

    this.callbacks.onAudioChunk?.(session, audioData);

    return true;
  }

  /**
   * End an audio session
   */
  endSession(participantId: string): AudioSession | null {
    const session = this.sessions.get(participantId);
    
    if (!session) {
      return null;
    }

    session.isActive = false;
    this.sessions.delete(participantId);

    const duration = Date.now() - session.startedAt;
    console.log(`[AudioSession] Ended session for ${participantId}: ${session.chunksReceived} chunks, ${(session.totalBytesReceived / 1024).toFixed(1)}KB, ${(duration / 1000).toFixed(1)}s`);

    this.callbacks.onSessionEnd?.(session);

    return session;
  }

  /**
   * Get active session for a participant
   */
  getSession(participantId: string): AudioSession | null {
    return this.sessions.get(participantId) || null;
  }

  /**
   * Get all active sessions in a room
   */
  getRoomSessions(roomId: string): AudioSession[] {
    return Array.from(this.sessions.values()).filter(s => s.roomId === roomId && s.isActive);
  }

  /**
   * Clean up all sessions for a room (when debate ends)
   */
  cleanupRoom(roomId: string): void {
    const roomSessions = this.getRoomSessions(roomId);
    for (const session of roomSessions) {
      this.endSession(session.participantId);
    }
  }
}

export const audioSessionManager = new AudioSessionManager();

