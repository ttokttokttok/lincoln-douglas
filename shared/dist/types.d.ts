export type LanguageCode = 'en' | 'ko' | 'ja' | 'es' | 'zh';
export type Side = 'AFF' | 'NEG';
export type RoomStatus = 'waiting' | 'ready' | 'in_progress' | 'completed';
export type SpeechRole = 'AC' | 'NC' | '1AR' | 'NR' | '2AR';
export interface Participant {
    id: string;
    displayName: string;
    side: Side | null;
    speakingLanguage: LanguageCode;
    listeningLanguage: LanguageCode;
    isReady: boolean;
    isConnected: boolean;
}
export interface RoomState {
    id: string;
    code: string;
    resolution: string;
    status: RoomStatus;
    hostId: string;
    participants: Participant[];
    currentSpeaker: string | null;
    currentSpeech: SpeechRole | null;
    createdAt: number;
}
export interface TimerState {
    speechTimeRemaining: number;
    prepTime: {
        AFF: number;
        NEG: number;
    };
    isRunning: boolean;
    currentSpeech: SpeechRole | null;
    isPrepTime: boolean;
    prepSide: Side | null;
}
export type WSMessageType = 'room:create' | 'room:join' | 'room:leave' | 'room:state' | 'room:ready' | 'room:start' | 'room:error' | 'participant:update' | 'participant:joined' | 'participant:left' | 'signal:offer' | 'signal:answer' | 'signal:ice' | 'timer:update' | 'timer:start' | 'timer:pause' | 'speech:start' | 'speech:end' | 'prep:start' | 'prep:end' | 'error' | 'audio:start' | 'audio:chunk' | 'audio:stop' | 'stt:interim' | 'stt:final' | 'translation:interim' | 'translation:complete' | 'flow:argument' | 'flow:state' | 'ballot:ready' | 'latency:update';
export interface WSMessage<T = unknown> {
    type: WSMessageType;
    payload: T;
}
export interface RoomCreatePayload {
    resolution: string;
    displayName: string;
}
export interface RoomJoinPayload {
    code: string;
    displayName: string;
}
export interface RoomStatePayload {
    room: RoomState;
}
export interface ParticipantUpdatePayload {
    participantId: string;
    updates: Partial<Participant>;
}
export interface SignalPayload {
    targetId: string;
    signal: unknown;
}
export interface TimerUpdatePayload {
    timer: TimerState;
}
export interface SpeechStartPayload {
    speech: SpeechRole;
    speakerId: string;
}
export interface PrepStartPayload {
    side: Side;
}
export interface ErrorPayload {
    message: string;
    code?: string;
}
export interface AudioStartPayload {
    speechId: string;
    language: LanguageCode;
}
export interface AudioChunkPayload {
    audioData: string;
    timestamp: number;
    speechId: string;
}
export interface AudioStopPayload {
    speechId: string;
}
export interface WordTimestamp {
    word: string;
    startTime: number;
    endTime: number;
    confidence: number;
}
export interface STTInterimPayload {
    speakerId: string;
    speechId: string;
    text: string;
    language: LanguageCode;
}
export interface STTFinalPayload {
    speakerId: string;
    speechId: string;
    text: string;
    language: LanguageCode;
    confidence: number;
    wordTimestamps?: WordTimestamp[];
}
export interface TranslationInterimPayload {
    speakerId: string;
    speechId: string;
    originalText: string;
    originalLanguage: LanguageCode;
    translatedText: string;
    targetLanguage: LanguageCode;
}
export interface TranslationCompletePayload {
    speakerId: string;
    speechId: string;
    originalText: string;
    originalLanguage: LanguageCode;
    translatedText: string;
    targetLanguage: LanguageCode;
    latencyMs: number;
}
export interface LatencyUpdatePayload {
    sttLatencyMs: number;
    translationLatencyMs: number;
}
export interface LanguageInfo {
    code: LanguageCode;
    name: string;
    nativeName: string;
    flag: string;
}
export declare const LANGUAGES: LanguageInfo[];
//# sourceMappingURL=types.d.ts.map