/**
 * Flow State Manager
 *
 * Manages the debate flow state for each room.
 * Tracks arguments and speech transcripts.
 */
class FlowStateManager {
    flowStates = new Map();
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
        console.log(`[FlowState] Cleared for room ${roomId}`);
    }
}
export const flowStateManager = new FlowStateManager();
//# sourceMappingURL=flowStateManager.js.map