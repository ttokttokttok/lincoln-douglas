import type { SpeechRole, Side, TimerState } from '@shared/types';
interface TimerCallbacks {
    onTick: (state: TimerState) => void;
    onSpeechComplete: (speech: SpeechRole, nextSpeech: SpeechRole | null) => void;
    onDebateComplete: () => void;
}
export declare class TimerController {
    private state;
    private interval;
    private callbacks;
    private currentSpeechIndex;
    private isPrepTime;
    private prepSide;
    constructor(callbacks: TimerCallbacks);
    getState(): TimerState;
    getCurrentSpeechIndex(): number;
    startDebate(): void;
    startSpeech(speech: SpeechRole): void;
    startPrep(side: Side): boolean;
    endPrep(): void;
    pause(): void;
    resume(): void;
    endSpeech(): void;
    startNextSpeech(): void;
    getSpeakerSide(speech?: SpeechRole): Side | null;
    getNextSpeech(): SpeechRole | null;
    private startInterval;
    private startPrepInterval;
    private stopTimer;
    destroy(): void;
}
export {};
//# sourceMappingURL=controller.d.ts.map