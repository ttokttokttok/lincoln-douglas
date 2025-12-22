import type { SpeechRole, Side, TimerState } from '@shared/types';
import { SPEECH_TIMES, SPEECH_ORDER, SPEECH_SIDES, PREP_TIME } from '@shared/types';

interface TimerCallbacks {
  onTick: (state: TimerState) => void;
  onSpeechComplete: (speech: SpeechRole, nextSpeech: SpeechRole | null) => void;
  onDebateComplete: () => void;
}

export class TimerController {
  private state: TimerState;
  private interval: NodeJS.Timeout | null = null;
  private callbacks: TimerCallbacks;
  private currentSpeechIndex: number = 0;

  constructor(callbacks: TimerCallbacks) {
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
  getState(): TimerState {
    return { ...this.state };
  }

  // Get the current speech index
  getCurrentSpeechIndex(): number {
    return this.currentSpeechIndex;
  }

  // Start the debate - begins with AC (Affirmative Constructive)
  startDebate(): void {
    this.currentSpeechIndex = 0;
    this.startSpeech(SPEECH_ORDER[0]);
  }

  // Start a specific speech
  startSpeech(speech: SpeechRole): void {
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
  startPrep(side: Side): boolean {
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
  endPrep(): void {
    if (!this.state.isPrepTime || !this.state.prepSide) return;

    this.stopTimer();
    this.state.isPrepTime = false;
    this.state.prepSide = null;
    this.state.isRunning = false;

    this.callbacks.onTick(this.getState());
  }

  // Pause the current timer
  pause(): void {
    if (!this.state.isRunning) return;

    this.stopTimer();
    this.state.isRunning = false;
    this.callbacks.onTick(this.getState());
  }

  // Resume the current timer
  resume(): void {
    if (this.state.isRunning) return;

    if (this.state.isPrepTime && this.state.prepSide && this.state.prepTime[this.state.prepSide] > 0) {
      this.state.isRunning = true;
      this.startPrepInterval(this.state.prepSide);
    } else if (this.state.speechTimeRemaining > 0 && this.state.currentSpeech) {
      this.state.isRunning = true;
      this.startInterval();
    }

    this.callbacks.onTick(this.getState());
  }

  // End current speech early and move to next
  endSpeech(): void {
    if (!this.state.currentSpeech) return;

    this.stopTimer();
    const completedSpeech = this.state.currentSpeech;

    // Move to next speech
    this.currentSpeechIndex++;

    if (this.currentSpeechIndex >= SPEECH_ORDER.length) {
      // Debate is complete
      this.state.currentSpeech = null;
      this.state.speechTimeRemaining = 0;
      this.state.isRunning = false;
      this.callbacks.onTick(this.getState());
      this.callbacks.onDebateComplete();
    } else {
      // More speeches remaining
      const nextSpeech = SPEECH_ORDER[this.currentSpeechIndex];
      this.state.currentSpeech = null;
      this.state.speechTimeRemaining = 0;
      this.state.isRunning = false;
      this.callbacks.onTick(this.getState());
      this.callbacks.onSpeechComplete(completedSpeech, nextSpeech);
    }
  }

  // Start the next speech (called after prep or transition)
  startNextSpeech(): void {
    if (this.currentSpeechIndex >= SPEECH_ORDER.length) return;

    const nextSpeech = SPEECH_ORDER[this.currentSpeechIndex];
    this.startSpeech(nextSpeech);
  }

  // Get who speaks for current/next speech
  getSpeakerSide(speech?: SpeechRole): Side | null {
    const targetSpeech = speech || this.state.currentSpeech;
    if (!targetSpeech) return null;
    return SPEECH_SIDES[targetSpeech];
  }

  // Get the next speech in order
  getNextSpeech(): SpeechRole | null {
    const nextIndex = this.currentSpeechIndex + 1;
    if (nextIndex >= SPEECH_ORDER.length) return null;
    return SPEECH_ORDER[nextIndex];
  }

  private startInterval(): void {
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

  private startPrepInterval(side: Side): void {
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

  private stopTimer(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  // Clean up
  destroy(): void {
    this.stopTimer();
  }
}
