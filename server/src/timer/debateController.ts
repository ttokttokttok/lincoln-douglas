import type { SpeechRole, Side, TimerState } from '@shared/types';
import { SPEECH_SIDES, SPEECH_ORDER } from '@shared/types';
import { TimerController } from './controller.js';
import { roomManager } from '../rooms/manager.js';

export interface DebateState {
  roomId: string;
  isActive: boolean;
  currentSpeaker: string | null;  // participant ID
  currentSpeech: SpeechRole | null;
  timer: TimerState;
}

interface DebateCallbacks {
  onTimerUpdate: (roomId: string, timer: TimerState) => void;
  onSpeechStart: (roomId: string, speech: SpeechRole, speakerId: string) => void;
  onSpeechEnd: (roomId: string, speech: SpeechRole, nextSpeech: SpeechRole | null) => void;
  onDebateStart: (roomId: string) => void;
  onDebateEnd: (roomId: string) => void;
}

class DebateManager {
  private debates: Map<string, { timer: TimerController; state: DebateState }> = new Map();
  private callbacks: DebateCallbacks | null = null;

  setCallbacks(callbacks: DebateCallbacks): void {
    this.callbacks = callbacks;
  }

  // Start a debate for a room
  startDebate(roomId: string): boolean {
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
    const debateState: DebateState = {
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
  endDebate(roomId: string): void {
    const debate = this.debates.get(roomId);
    if (!debate) return;

    debate.timer.destroy();
    debate.state.isActive = false;

    this.debates.delete(roomId);
    roomManager.setRoomStatus(roomId, 'completed');

    this.callbacks?.onDebateEnd(roomId);
  }

  // Get debate state for a room
  getDebateState(roomId: string): DebateState | null {
    return this.debates.get(roomId)?.state || null;
  }

  // Get timer state for a room
  getTimerState(roomId: string): TimerState | null {
    return this.debates.get(roomId)?.state.timer || null;
  }

  // Get current speech index for a room
  getCurrentSpeechIndex(roomId: string): number | null {
    const debate = this.debates.get(roomId);
    if (!debate) return null;
    return debate.timer.getCurrentSpeechIndex();
  }

  // Start prep time
  startPrep(roomId: string, side: Side): boolean {
    const debate = this.debates.get(roomId);
    if (!debate || !debate.state.isActive) return false;

    // Can only use prep between speeches (when timer not running speech)
    if (debate.state.timer.isRunning && debate.state.currentSpeech) {
      return false;
    }

    return debate.timer.startPrep(side);
  }

  // End prep time
  endPrep(roomId: string): void {
    const debate = this.debates.get(roomId);
    if (!debate) return;

    debate.timer.endPrep();
  }

  // Start next speech (after prep or transition)
  startNextSpeech(roomId: string): boolean {
    const debate = this.debates.get(roomId);
    if (!debate || !debate.state.isActive) return false;

    const room = roomManager.getRoom(roomId);
    if (!room) return false;

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

    if (!speaker) return false;

    debate.timer.startNextSpeech();
    debate.state.currentSpeaker = speaker.id;
    debate.state.currentSpeech = nextSpeech;

    this.callbacks?.onSpeechStart(roomId, nextSpeech, speaker.id);
    return true;
  }

  // End current speech early
  endSpeech(roomId: string): void {
    const debate = this.debates.get(roomId);
    if (!debate) return;

    debate.timer.endSpeech();
  }

  // Pause timer
  pauseTimer(roomId: string): void {
    const debate = this.debates.get(roomId);
    if (!debate) return;

    debate.timer.pause();
  }

  // Resume timer
  resumeTimer(roomId: string): void {
    const debate = this.debates.get(roomId);
    if (!debate) return;

    debate.timer.resume();
  }

  // Clean up when room is destroyed
  cleanupRoom(roomId: string): void {
    const debate = this.debates.get(roomId);
    if (debate) {
      debate.timer.destroy();
      this.debates.delete(roomId);
    }
  }
}

export const debateManager = new DebateManager();
