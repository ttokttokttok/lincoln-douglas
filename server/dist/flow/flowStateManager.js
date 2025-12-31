/**
 * Flow State Manager
 *
 * Manages the debate flow state for each room.
 * Tracks arguments and speech transcripts.
 */
class FlowStateManager {
    flowStates = new Map();
    // Track pending argument extractions per room
    pendingExtractions = new Map();
    // Track current speech version per room to invalidate stale operations
    speechVersions = new Map();
    /**
     * Initialize flow state for a room
     */
    initializeRoom(roomId) {
        const flowState = {
            roomId,
            arguments: [],
            speechTranscripts: {
                AC: '',
                NC: '',
                '1AR': '',
                NR: '',
                '2AR': '',
            },
        };
        this.flowStates.set(roomId, flowState);
        console.log(`[FlowState] Initialized for room ${roomId}`);
        return flowState;
    }
    /**
     * Get flow state for a room (creates if doesn't exist)
     */
    getFlowState(roomId) {
        let flowState = this.flowStates.get(roomId);
        if (!flowState) {
            flowState = this.initializeRoom(roomId);
        }
        return flowState;
    }
    /**
     * Add transcript text for a speech
     */
    addTranscript(roomId, speech, text) {
        const flowState = this.getFlowState(roomId);
        // Append to existing transcript (with space separator)
        if (flowState.speechTranscripts[speech]) {
            flowState.speechTranscripts[speech] += ' ' + text;
        }
        else {
            flowState.speechTranscripts[speech] = text;
        }
    }
    /**
     * Get the full transcript for a speech
     */
    getSpeechTranscript(roomId, speech) {
        return this.getFlowState(roomId).speechTranscripts[speech] || '';
    }
    /**
     * Add extracted arguments to the flow
     */
    addArguments(roomId, newArguments) {
        const flowState = this.getFlowState(roomId);
        flowState.arguments.push(...newArguments);
        console.log(`[FlowState] Added ${newArguments.length} arguments for room ${roomId}`);
    }
    /**
     * Get all arguments for a room
     */
    getArguments(roomId) {
        return this.getFlowState(roomId).arguments;
    }
    /**
     * Get arguments by speech
     */
    getArgumentsBySpeech(roomId, speech) {
        return this.getFlowState(roomId).arguments.filter(a => a.speech === speech);
    }
    /**
     * Get arguments by side
     */
    getArgumentsBySide(roomId, side) {
        return this.getFlowState(roomId).arguments.filter(a => a.side === side);
    }
    /**
     * Clear flow state when room is destroyed
     */
    clearRoom(roomId) {
        this.flowStates.delete(roomId);
        this.pendingExtractions.delete(roomId);
        this.speechVersions.delete(roomId);
        console.log(`[FlowState] Cleared for room ${roomId}`);
    }
    /**
     * Get current speech version for a room (used to track speech sessions)
     */
    getSpeechVersion(roomId) {
        return this.speechVersions.get(roomId) || 0;
    }
    /**
     * Increment speech version when a speech ends
     * This invalidates any in-flight operations from the previous speech
     */
    incrementSpeechVersion(roomId) {
        const current = this.speechVersions.get(roomId) || 0;
        const next = current + 1;
        this.speechVersions.set(roomId, next);
        console.log(`[FlowState] Speech version incremented for room ${roomId}: ${current} -> ${next}`);
        return next;
    }
    /**
     * Check if a speech version is still current
     * Used to skip stale operations after a speech has ended
     */
    isSpeechVersionCurrent(roomId, version) {
        const current = this.speechVersions.get(roomId) || 0;
        return version === current;
    }
    /**
     * Register a pending extraction for a room
     */
    registerPendingExtraction(roomId, promise) {
        if (!this.pendingExtractions.has(roomId)) {
            this.pendingExtractions.set(roomId, []);
        }
        this.pendingExtractions.get(roomId).push(promise);
    }
    /**
     * Wait for all pending extractions to complete for a room
     */
    async waitForPendingExtractions(roomId) {
        const pending = this.pendingExtractions.get(roomId);
        if (pending && pending.length > 0) {
            console.log(`[FlowState] Waiting for ${pending.length} pending extraction(s) in room ${roomId}`);
            await Promise.all(pending);
            this.pendingExtractions.set(roomId, []); // Clear after completion
            console.log(`[FlowState] All pending extractions complete for room ${roomId}`);
        }
    }
    /**
     * Check if there are pending extractions
     */
    hasPendingExtractions(roomId) {
        const pending = this.pendingExtractions.get(roomId);
        return pending !== undefined && pending.length > 0;
    }
}
export const flowStateManager = new FlowStateManager();
//# sourceMappingURL=flowStateManager.js.map