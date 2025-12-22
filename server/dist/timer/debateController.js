import { SPEECH_SIDES, SPEECH_ORDER } from '@shared/types';
import { TimerController } from './controller.js';
import { roomManager } from '../rooms/manager.js';
class DebateManager {
    debates = new Map();
    callbacks = null;
    setCallbacks(callbacks) {
        this.callbacks = callbacks;
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
            },
            isPrepTime: false,
            prepSide: null,
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
        this.debates.set(roomId, { timer: timerController, state: debateState });
        // Update room status
        roomManager.setRoomStatus(roomId, 'in_progress');
        // Notify debate started
        this.callbacks?.onDebateStart(roomId);
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
    // Start prep time
    startPrep(roomId, side) {
        const debate = this.debates.get(roomId);
        if (!debate || !debate.state.isActive)
            return false;
        // Can only use prep between speeches (when timer not running speech)
        if (debate.state.timer.isRunning && debate.state.currentSpeech) {
            return false;
        }
        const success = debate.timer.startPrep(side);
        if (success) {
            debate.state.isPrepTime = true;
            debate.state.prepSide = side;
        }
        return success;
    }
    // End prep time
    endPrep(roomId) {
        const debate = this.debates.get(roomId);
        if (!debate)
            return;
        debate.timer.endPrep();
        debate.state.isPrepTime = false;
        debate.state.prepSide = null;
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
        debate.state.isPrepTime = false;
        debate.state.prepSide = null;
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