import { SPEECH_SIDES, SPEECH_ORDER } from '@shared/types';
import { TimerController } from './controller.js';
import { roomManager } from '../rooms/manager.js';
// Timeout configuration
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_DURATION_MS = 90 * 60 * 1000; // 90 minutes
const WARNING_BEFORE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minute warning
class DebateManager {
    debates = new Map();
    callbacks = null;
    setCallbacks(callbacks) {
        this.callbacks = callbacks;
    }
    /**
     * Record activity for a room (resets inactivity timer)
     * Call this when audio chunks are received, speech starts, etc.
     */
    recordActivity(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate || !debate.state.isActive)
            return;
        debate.state.lastActivityTime = Date.now();
        this.resetInactivityTimer(roomId);
    }
    /**
     * Start timeout timers for a debate
     */
    startTimeoutTimers(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate)
            return;
        const now = Date.now();
        debate.state.debateStartTime = now;
        debate.state.lastActivityTime = now;
        // Clear any existing timers
        this.clearTimeoutTimers(roomId);
        // Start max duration timer (90 minutes)
        debate.timeouts.maxDurationWarningTimer = setTimeout(() => {
            console.log(`[Timeout] Max duration warning for room ${roomId}`);
            this.callbacks?.onTimeoutWarning?.(roomId, 'max_duration', WARNING_BEFORE_TIMEOUT_MS / 1000);
        }, MAX_DURATION_MS - WARNING_BEFORE_TIMEOUT_MS);
        debate.timeouts.maxDurationTimer = setTimeout(() => {
            console.log(`[Timeout] Max duration reached for room ${roomId}`);
            this.handleTimeout(roomId, 'max_duration');
        }, MAX_DURATION_MS);
        // Start inactivity timer (10 minutes)
        this.resetInactivityTimer(roomId);
        console.log(`[Timeout] Started timeout timers for room ${roomId}`);
        console.log(`[Timeout] Max duration: ${MAX_DURATION_MS / 60000} min, Inactivity: ${INACTIVITY_TIMEOUT_MS / 60000} min`);
    }
    /**
     * Reset the inactivity timer (called when activity is recorded)
     */
    resetInactivityTimer(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate || !debate.state.isActive)
            return;
        // Clear existing inactivity timers
        if (debate.timeouts.inactivityWarningTimer) {
            clearTimeout(debate.timeouts.inactivityWarningTimer);
            debate.timeouts.inactivityWarningTimer = null;
        }
        if (debate.timeouts.inactivityTimer) {
            clearTimeout(debate.timeouts.inactivityTimer);
            debate.timeouts.inactivityTimer = null;
        }
        // Set new inactivity warning timer
        debate.timeouts.inactivityWarningTimer = setTimeout(() => {
            console.log(`[Timeout] Inactivity warning for room ${roomId}`);
            this.callbacks?.onTimeoutWarning?.(roomId, 'inactivity', WARNING_BEFORE_TIMEOUT_MS / 1000);
        }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_TIMEOUT_MS);
        // Set new inactivity timer
        debate.timeouts.inactivityTimer = setTimeout(() => {
            console.log(`[Timeout] Inactivity timeout for room ${roomId}`);
            this.handleTimeout(roomId, 'inactivity');
        }, INACTIVITY_TIMEOUT_MS);
    }
    /**
     * Handle timeout - end the debate
     */
    handleTimeout(roomId, reason) {
        const debate = this.debates.get(roomId);
        if (!debate || !debate.state.isActive)
            return;
        console.log(`[Timeout] Ending debate in room ${roomId} due to ${reason}`);
        // Notify about timeout end
        this.callbacks?.onTimeoutEnd?.(roomId, reason);
        // End the debate
        this.endDebate(roomId);
    }
    /**
     * Clear all timeout timers for a room
     */
    clearTimeoutTimers(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate)
            return;
        if (debate.timeouts.inactivityTimer) {
            clearTimeout(debate.timeouts.inactivityTimer);
            debate.timeouts.inactivityTimer = null;
        }
        if (debate.timeouts.inactivityWarningTimer) {
            clearTimeout(debate.timeouts.inactivityWarningTimer);
            debate.timeouts.inactivityWarningTimer = null;
        }
        if (debate.timeouts.maxDurationTimer) {
            clearTimeout(debate.timeouts.maxDurationTimer);
            debate.timeouts.maxDurationTimer = null;
        }
        if (debate.timeouts.maxDurationWarningTimer) {
            clearTimeout(debate.timeouts.maxDurationWarningTimer);
            debate.timeouts.maxDurationWarningTimer = null;
        }
    }
    // Start a debate for a room
    startDebate(roomId) {
        if (this.debates.has(roomId)) {
            return false; // Already has an active debate
        }
        const room = roomManager.getRoom(roomId);
        if (!room || room.participants.size !== 2) {
            return false;
        }
        // Check both participants are ready and have sides
        const participants = Array.from(room.participants.values());
        const affParticipant = participants.find(p => p.side === 'AFF');
        const negParticipant = participants.find(p => p.side === 'NEG');
        if (!affParticipant || !negParticipant) {
            return false;
        }
        // Create debate state
        const now = Date.now();
        const debateState = {
            roomId,
            isActive: true,
            currentSpeaker: null,
            currentSpeech: null,
            timer: {
                speechTimeRemaining: 0,
                prepTime: { AFF: 120, NEG: 120 },
                isRunning: false,
                currentSpeech: null,
                isPrepTime: false,
                prepSide: null,
            },
            lastActivityTime: now,
            debateStartTime: now,
        };
        // Initialize timeout timers
        const timeoutTimers = {
            inactivityTimer: null,
            inactivityWarningTimer: null,
            maxDurationTimer: null,
            maxDurationWarningTimer: null,
        };
        // Create timer controller
        const timerController = new TimerController({
            onTick: (timerState) => {
                debateState.timer = timerState;
                debateState.currentSpeech = timerState.currentSpeech;
                this.callbacks?.onTimerUpdate(roomId, timerState);
            },
            onSpeechComplete: (completedSpeech, nextSpeech) => {
                debateState.currentSpeaker = null;
                debateState.currentSpeech = null;
                this.callbacks?.onSpeechEnd(roomId, completedSpeech, nextSpeech);
            },
            onDebateComplete: () => {
                this.endDebate(roomId);
            },
        });
        this.debates.set(roomId, { timer: timerController, state: debateState, timeouts: timeoutTimers });
        // Update room status
        roomManager.setRoomStatus(roomId, 'in_progress');
        // Notify debate started
        this.callbacks?.onDebateStart(roomId);
        // Start timeout timers
        this.startTimeoutTimers(roomId);
        // Start the first speech (AC)
        timerController.startDebate();
        // Set the current speaker (AFF for AC)
        debateState.currentSpeaker = affParticipant.id;
        debateState.currentSpeech = 'AC';
        this.callbacks?.onSpeechStart(roomId, 'AC', affParticipant.id);
        return true;
    }
    // End a debate
    endDebate(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate)
            return;
        // Clear timeout timers
        this.clearTimeoutTimers(roomId);
        debate.timer.destroy();
        debate.state.isActive = false;
        this.debates.delete(roomId);
        roomManager.setRoomStatus(roomId, 'completed');
        this.callbacks?.onDebateEnd(roomId);
    }
    // Get debate state for a room
    getDebateState(roomId) {
        return this.debates.get(roomId)?.state || null;
    }
    // Get timer state for a room
    getTimerState(roomId) {
        return this.debates.get(roomId)?.state.timer || null;
    }
    // Get current speech index for a room
    getCurrentSpeechIndex(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate)
            return null;
        return debate.timer.getCurrentSpeechIndex();
    }
    // Start prep time
    startPrep(roomId, side) {
        const debate = this.debates.get(roomId);
        if (!debate || !debate.state.isActive)
            return false;
        // Can only use prep between speeches (when timer not running speech)
        if (debate.state.timer.isRunning && debate.state.currentSpeech) {
            return false;
        }
        return debate.timer.startPrep(side);
    }
    // End prep time
    endPrep(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate)
            return;
        debate.timer.endPrep();
    }
    // Start next speech (after prep or transition)
    startNextSpeech(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate || !debate.state.isActive)
            return false;
        const room = roomManager.getRoom(roomId);
        if (!room)
            return false;
        // Get the speech at current index (which was set by endSpeech incrementing the index)
        const speechIndex = debate.timer.getCurrentSpeechIndex();
        if (speechIndex >= SPEECH_ORDER.length) {
            // No more speeches
            return false;
        }
        const nextSpeech = SPEECH_ORDER[speechIndex];
        // Determine who speaks
        const speakerSide = SPEECH_SIDES[nextSpeech];
        const participants = Array.from(room.participants.values());
        const speaker = participants.find(p => p.side === speakerSide);
        if (!speaker)
            return false;
        debate.timer.startNextSpeech();
        debate.state.currentSpeaker = speaker.id;
        debate.state.currentSpeech = nextSpeech;
        this.callbacks?.onSpeechStart(roomId, nextSpeech, speaker.id);
        return true;
    }
    // End current speech early
    endSpeech(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate)
            return;
        debate.timer.endSpeech();
    }
    // Pause timer
    pauseTimer(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate)
            return;
        debate.timer.pause();
    }
    // Resume timer
    resumeTimer(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate)
            return;
        debate.timer.resume();
    }
    // Clean up when room is destroyed
    cleanupRoom(roomId) {
        const debate = this.debates.get(roomId);
        if (debate) {
            debate.timer.destroy();
            this.debates.delete(roomId);
        }
    }
}
export const debateManager = new DebateManager();
//# sourceMappingURL=debateController.js.map