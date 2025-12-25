/**
 * Audio Session Manager
 *
 * Manages audio streaming sessions for each debater.
 * In Phase 1, this just tracks sessions and logs chunks.
 * In Phase 2-3, this will integrate with Google STT and translation services.
 */
class AudioSessionManager {
    sessions = new Map();
    callbacks = {};
    /**
     * Set callbacks for audio processing
     * Will be used to integrate with STT service
     */
    setCallbacks(callbacks) {
        this.callbacks = callbacks;
    }
    /**
     * Start a new audio session for a participant
     */
    startSession(roomId, participantId, speechId, language) {
        // End any existing session for this participant
        this.endSession(participantId);
        const session = {
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
    processChunk(participantId, audioData) {
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
    endSession(participantId) {
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
    getSession(participantId) {
        return this.sessions.get(participantId) || null;
    }
    /**
     * Get all active sessions in a room
     */
    getRoomSessions(roomId) {
        return Array.from(this.sessions.values()).filter(s => s.roomId === roomId && s.isActive);
    }
    /**
     * Clean up all sessions for a room (when debate ends)
     */
    cleanupRoom(roomId) {
        const roomSessions = this.getRoomSessions(roomId);
        for (const session of roomSessions) {
            this.endSession(session.participantId);
        }
    }
}
export const audioSessionManager = new AudioSessionManager();
//# sourceMappingURL=sessionManager.js.map