/**
 * TTS Session Manager
 *
 * Manages TTS sessions per participant, including:
 * - Voice selection per participant
 * - TTS request queuing (to prevent overlapping audio)
 * - Session lifecycle management
 */
import { elevenLabsTTS } from './elevenLabsTts';
class TTSSessionManager {
    sessions = new Map();
    participantVoices = new Map(); // participantId -> voiceId
    /**
     * Create a TTS session for a participant
     */
    createSession(participantId, roomId, voiceId) {
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
    getVoiceForParticipant(participantId) {
        return this.participantVoices.get(participantId);
    }
    /**
     * Set the voice for a participant (updates both session and mapping)
     */
    setVoiceForParticipant(participantId, voiceId) {
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
    getOrCreateSession(participantId, roomId, language) {
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
            session = this.sessions.get(participantId);
        }
        return session;
    }
    /**
     * Check if a session exists for a participant
     */
    hasSession(participantId) {
        return this.sessions.has(participantId);
    }
    /**
     * Get session for a participant
     */
    getSession(participantId) {
        return this.sessions.get(participantId);
    }
    /**
     * Queue a TTS request for a participant
     * Requests are processed sequentially to prevent audio overlap
     */
    async queueTTS(participantId, roomId, speechId, request, onChunk, onComplete, onError) {
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
    async processQueue(session) {
        if (session.isGenerating || session.queue.length === 0) {
            return;
        }
        session.isGenerating = true;
        const queuedRequest = session.queue.shift();
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
        }
        catch (error) {
            console.error(`[TTSSession] Unexpected error for ${session.participantId}:`, error);
            session.isGenerating = false;
            queuedRequest.onError(error);
            // Try next in queue
            this.processQueue(session);
        }
    }
    /**
     * Clear the queue for a participant (e.g., when speech ends prematurely)
     */
    clearQueue(participantId) {
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
    endSession(participantId) {
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
    endRoomSessions(roomId) {
        const sessionsToEnd = [];
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
    getRoomSessions(roomId) {
        const roomSessions = [];
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
    getStats() {
        let activeSessions = 0;
        let totalQueued = 0;
        for (const session of this.sessions.values()) {
            if (session.isGenerating)
                activeSessions++;
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
    isGenerating(participantId) {
        return this.sessions.get(participantId)?.isGenerating || false;
    }
    /**
     * Get the queue length for a participant
     */
    getQueueLength(participantId) {
        return this.sessions.get(participantId)?.queue.length || 0;
    }
}
// Export singleton instance
export const ttsSessionManager = new TTSSessionManager();
//# sourceMappingURL=sessionManager.js.map