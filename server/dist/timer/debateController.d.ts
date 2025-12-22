import type { SpeechRole, Side, TimerState } from '@shared/types';
export interface DebateState {
    roomId: string;
    isActive: boolean;
    currentSpeaker: string | null;
    currentSpeech: SpeechRole | null;
    timer: TimerState;
    isPrepTime: boolean;
    prepSide: Side | null;
}
interface DebateCallbacks {
    onTimerUpdate: (roomId: string, timer: TimerState) => void;
    onSpeechStart: (roomId: string, speech: SpeechRole, speakerId: string) => void;
    onSpeechEnd: (roomId: string, speech: SpeechRole, nextSpeech: SpeechRole | null) => void;
    onDebateStart: (roomId: string) => void;
    onDebateEnd: (roomId: string) => void;
}
declare class DebateManager {
    private debates;
    private callbacks;
    setCallbacks(callbacks: DebateCallbacks): void;
    startDebate(roomId: string): boolean;
    endDebate(roomId: string): void;
    getDebateState(roomId: string): DebateState | null;
    getTimerState(roomId: string): TimerState | null;
    startPrep(roomId: string, side: Side): boolean;
    endPrep(roomId: string): void;
    startNextSpeech(roomId: string): boolean;
    endSpeech(roomId: string): void;
    pauseTimer(roomId: string): void;
    resumeTimer(roomId: string): void;
    cleanupRoom(roomId: string): void;
}
export declare const debateManager: DebateManager;
export {};
//# sourceMappingURL=debateController.d.ts.map