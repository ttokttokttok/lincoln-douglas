import { SPEECH_TIMES, SPEECH_ORDER, SPEECH_SIDES, PREP_TIME } from '@shared/types';
export class TimerController {
    state;
    interval = null;
    callbacks;
    currentSpeechIndex = 0;
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.state = {
            speechTimeRemaining: 0,
            prepTime: { AFF: PREP_TIME, NEG: PREP_TIME },
            isRunning: false,
            currentSpeech: null,
            isPrepTime: false,
            prepSide: null,
        };
    }
    // Get the current timer state
    getState() {
        return { ...this.state };
    }
    // Get the current speech index
    getCurrentSpeechIndex() {
        return this.currentSpeechIndex;
    }
    // Check if timer is paused (has time remaining but not running)
    isPaused() {
        return !this.state.isRunning &&
            this.state.currentSpeech !== null &&
            this.state.speechTimeRemaining > 0;
    }
    // Start the debate - begins with AC (Affirmative Constructive)
    startDebate() {
        this.currentSpeechIndex = 0;
        this.startSpeech(SPEECH_ORDER[0]);
    }
    // Start a specific speech
    startSpeech(speech) {
        this.stopTimer();
        this.state.isPrepTime = false;
        this.state.prepSide = null;
        this.state.currentSpeech = speech;
        this.state.speechTimeRemaining = SPEECH_TIMES[speech];
        this.state.isRunning = true;
        this.startInterval();
        this.callbacks.onTick(this.getState());
    }
    // Start prep time for a side
    startPrep(side) {
        if (this.state.prepTime[side] <= 0) {
            return false; // No prep time remaining
        }
        this.stopTimer();
        this.state.isPrepTime = true;
        this.state.prepSide = side;
        this.state.isRunning = true;
        this.startPrepInterval(side);
        this.callbacks.onTick(this.getState());
        return true;
    }
    // End prep time
    endPrep() {
        if (!this.state.isPrepTime || !this.state.prepSide)
            return;
        this.stopTimer();
        this.state.isPrepTime = false;
        this.state.prepSide = null;
        this.state.isRunning = false;
        this.callbacks.onTick(this.getState());
    }
    // Pause the current timer
    pause() {
        if (!this.state.isRunning)
            return;
        this.stopTimer();
        this.state.isRunning = false;
        this.callbacks.onTick(this.getState());
    }
    // Resume the current timer
    resume() {
        if (this.state.isRunning)
            return;
        if (this.state.isPrepTime && this.state.prepSide && this.state.prepTime[this.state.prepSide] > 0) {
            this.state.isRunning = true;
            this.startPrepInterval(this.state.prepSide);
        }
        else if (this.state.speechTimeRemaining > 0 && this.state.currentSpeech) {
            this.state.isRunning = true;
            this.startInterval();
        }
        this.callbacks.onTick(this.getState());
    }
    // End current speech early and move to next
    endSpeech() {
        if (!this.state.currentSpeech)
            return;
        this.stopTimer();
        const completedSpeech = this.state.currentSpeech;
        // Move to next speech
        this.currentSpeechIndex++;
        // Determine next speech (null if debate is complete)
        const nextSpeech = this.currentSpeechIndex < SPEECH_ORDER.length
            ? SPEECH_ORDER[this.currentSpeechIndex]
            : null;
        // Update state
        this.state.currentSpeech = null;
        this.state.speechTimeRemaining = 0;
        this.state.isRunning = false;
        this.callbacks.onTick(this.getState());
        // Always notify speech completion (so 2AR arguments get extracted!)
        this.callbacks.onSpeechComplete(completedSpeech, nextSpeech);
        // If debate is complete, notify after speech completion
        if (this.currentSpeechIndex >= SPEECH_ORDER.length) {
            this.callbacks.onDebateComplete();
        }
    }
    // Start the next speech (called after prep or transition)
    startNextSpeech() {
        if (this.currentSpeechIndex >= SPEECH_ORDER.length)
            return;
        const nextSpeech = SPEECH_ORDER[this.currentSpeechIndex];
        this.startSpeech(nextSpeech);
    }
    // Get who speaks for current/next speech
    getSpeakerSide(speech) {
        const targetSpeech = speech || this.state.currentSpeech;
        if (!targetSpeech)
            return null;
        return SPEECH_SIDES[targetSpeech];
    }
    // Get the next speech in order
    getNextSpeech() {
        const nextIndex = this.currentSpeechIndex + 1;
        if (nextIndex >= SPEECH_ORDER.length)
            return null;
        return SPEECH_ORDER[nextIndex];
    }
    startInterval() {
        this.interval = setInterval(() => {
            if (this.state.speechTimeRemaining > 0) {
                this.state.speechTimeRemaining--;
                this.callbacks.onTick(this.getState());
                if (this.state.speechTimeRemaining <= 0) {
                    // Speech time is up
                    this.endSpeech();
                }
            }
        }, 1000);
    }
    startPrepInterval(side) {
        this.interval = setInterval(() => {
            if (this.state.prepTime[side] > 0) {
                this.state.prepTime[side]--;
                this.callbacks.onTick(this.getState());
                if (this.state.prepTime[side] <= 0) {
                    // Prep time exhausted
                    this.endPrep();
                }
            }
        }, 1000);
    }
    stopTimer() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
    // Clean up
    destroy() {
        this.stopTimer();
    }
}
//# sourceMappingURL=controller.js.map