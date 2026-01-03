import { v4 as uuid } from 'uuid';
// Grace period before a disconnected participant is removed (30 seconds)
const DISCONNECT_GRACE_PERIOD_MS = 30000;
// Session token expiry (1 hour - covers long debates)
const SESSION_TOKEN_EXPIRY_MS = 60 * 60 * 1000;
class SessionManager {
    // Session token -> session data
    sessions = new Map();
    // Participant ID -> session token (for quick lookup)
    participantToSession = new Map();
    // Client ID -> session token (for disconnect handling)
    clientToSession = new Map();
    /**
     * Create a new session for a participant joining a room
     */
    createSession(participantId, roomId, clientId, displayName) {
        // Check if participant already has a session in this room
        const existingToken = this.participantToSession.get(participantId);
        if (existingToken) {
            const existingSession = this.sessions.get(existingToken);
            if (existingSession && existingSession.roomId === roomId) {
                // Reactivate existing session
                this.reactivateSession(existingToken, clientId);
                return existingToken;
            }
        }
        const sessionToken = uuid();
        const session = {
            sessionToken,
            participantId,
            roomId,
            displayName,
            createdAt: Date.now(),
            lastConnectedAt: Date.now(),
            currentClientId: clientId,
            disconnectTimer: null,
            isInGracePeriod: false,
        };
        this.sessions.set(sessionToken, session);
        this.participantToSession.set(participantId, sessionToken);
        this.clientToSession.set(clientId, sessionToken);
        console.log(`[Session] Created session for ${displayName} in room ${roomId}`);
        return sessionToken;
    }
    /**
     * Get session by token
     */
    getSession(sessionToken) {
        return this.sessions.get(sessionToken);
    }
    /**
     * Get session by participant ID
     */
    getSessionByParticipant(participantId) {
        const token = this.participantToSession.get(participantId);
        return token ? this.sessions.get(token) : undefined;
    }
    /**
     * Get session by client ID
     */
    getSessionByClient(clientId) {
        const token = this.clientToSession.get(clientId);
        return token ? this.sessions.get(token) : undefined;
    }
    /**
     * Handle client disconnect - start grace period instead of immediate removal
     * Returns true if grace period started, false if session not found
     */
    handleDisconnect(clientId, onGracePeriodExpired) {
        const token = this.clientToSession.get(clientId);
        if (!token)
            return null;
        const session = this.sessions.get(token);
        if (!session)
            return null;
        // Clear client mapping (client ID is no longer valid)
        this.clientToSession.delete(clientId);
        session.currentClientId = null;
        // If already in grace period, don't restart timer
        if (session.isInGracePeriod) {
            console.log(`[Session] ${session.displayName} already in grace period`);
            return { session, startedGracePeriod: false };
        }
        // Start grace period
        session.isInGracePeriod = true;
        console.log(`[Session] ${session.displayName} disconnected, starting ${DISCONNECT_GRACE_PERIOD_MS / 1000}s grace period`);
        session.disconnectTimer = setTimeout(() => {
            // Grace period expired - participant didn't reconnect
            console.log(`[Session] Grace period expired for ${session.displayName}`);
            onGracePeriodExpired(session);
            this.removeSession(token);
        }, DISCONNECT_GRACE_PERIOD_MS);
        return { session, startedGracePeriod: true };
    }
    /**
     * Attempt to rejoin with a session token
     * Returns the session if valid and can reconnect
     */
    attemptRejoin(sessionToken, newClientId, displayName) {
        const session = this.sessions.get(sessionToken);
        if (!session) {
            console.log(`[Session] Rejoin failed: session not found`);
            return null;
        }
        // Check if session is expired
        if (Date.now() - session.createdAt > SESSION_TOKEN_EXPIRY_MS) {
            console.log(`[Session] Rejoin failed: session expired`);
            this.removeSession(sessionToken);
            return null;
        }
        // Cancel grace period timer if active
        if (session.disconnectTimer) {
            clearTimeout(session.disconnectTimer);
            session.disconnectTimer = null;
        }
        // Reactivate session with new client
        session.isInGracePeriod = false;
        session.currentClientId = newClientId;
        session.lastConnectedAt = Date.now();
        session.displayName = displayName; // Update in case it changed
        // Update client mapping
        this.clientToSession.set(newClientId, sessionToken);
        console.log(`[Session] ${displayName} rejoined successfully`);
        return session;
    }
    /**
     * Reactivate an existing session (same participant rejoining same room)
     */
    reactivateSession(sessionToken, newClientId) {
        const session = this.sessions.get(sessionToken);
        if (!session)
            return;
        // Cancel any pending disconnect timer
        if (session.disconnectTimer) {
            clearTimeout(session.disconnectTimer);
            session.disconnectTimer = null;
        }
        // Clear old client mapping if exists
        if (session.currentClientId) {
            this.clientToSession.delete(session.currentClientId);
        }
        // Update to new client
        session.isInGracePeriod = false;
        session.currentClientId = newClientId;
        session.lastConnectedAt = Date.now();
        this.clientToSession.set(newClientId, sessionToken);
        console.log(`[Session] Reactivated session for ${session.displayName}`);
    }
    /**
     * Remove a session completely
     */
    removeSession(sessionToken) {
        const session = this.sessions.get(sessionToken);
        if (!session)
            return;
        // Clear timer if active
        if (session.disconnectTimer) {
            clearTimeout(session.disconnectTimer);
        }
        // Clean up all mappings
        this.participantToSession.delete(session.participantId);
        if (session.currentClientId) {
            this.clientToSession.delete(session.currentClientId);
        }
        this.sessions.delete(sessionToken);
        console.log(`[Session] Removed session for ${session.displayName}`);
    }
    /**
     * Remove all sessions for a room (used when room is deleted)
     */
    removeRoomSessions(roomId) {
        for (const [token, session] of this.sessions) {
            if (session.roomId === roomId) {
                this.removeSession(token);
            }
        }
    }
    /**
     * Check if a participant is currently connected (not in grace period)
     */
    isParticipantConnected(participantId) {
        const session = this.getSessionByParticipant(participantId);
        if (!session)
            return false;
        return session.currentClientId !== null && !session.isInGracePeriod;
    }
    /**
     * Check if a participant is in grace period (disconnected but may reconnect)
     */
    isParticipantInGracePeriod(participantId) {
        const session = this.getSessionByParticipant(participantId);
        return session?.isInGracePeriod ?? false;
    }
    /**
     * Get all sessions in a room
     */
    getRoomSessions(roomId) {
        const sessions = [];
        for (const session of this.sessions.values()) {
            if (session.roomId === roomId) {
                sessions.push(session);
            }
        }
        return sessions;
    }
}
export const sessionManager = new SessionManager();
//# sourceMappingURL=sessionManager.js.map