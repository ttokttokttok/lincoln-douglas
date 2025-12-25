export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ru' | 'zh' | 'ja' | 'ko' | 'nl' | 'pl' | 'uk' | 'cs' | 'ro' | 'hu' | 'el' | 'sv' | 'da' | 'fi' | 'no' | 'bg' | 'hr' | 'sk' | 'sl' | 'et' | 'lv' | 'lt' | 'hi' | 'bn' | 'ta' | 'te' | 'mr' | 'gu' | 'kn' | 'ml' | 'pa' | 'th' | 'vi' | 'id' | 'ms' | 'tl' | 'my' | 'km' | 'lo' | 'ar' | 'he' | 'fa' | 'tr' | 'ur' | 'sw' | 'am' | 'ha' | 'yo' | 'ig' | 'zu' | 'af' | 'sq' | 'hy' | 'az' | 'eu' | 'be' | 'bs' | 'ca' | 'cy' | 'eo' | 'gl' | 'ka' | 'is' | 'mk' | 'mn' | 'ne' | 'ps' | 'si' | 'so' | 'tg' | 'uz' | 'xh';
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
export type WSMessageType = 'room:create' | 'room:join' | 'room:leave' | 'room:state' | 'room:ready' | 'room:start' | 'room:error' | 'participant:update' | 'participant:joined' | 'participant:left' | 'signal:offer' | 'signal:answer' | 'signal:ice' | 'timer:update' | 'timer:start' | 'timer:pause' | 'speech:start' | 'speech:end' | 'prep:start' | 'prep:end' | 'error' | 'audio:start' | 'audio:chunk' | 'audio:stop' | 'stt:interim' | 'stt:final' | 'translation:interim' | 'translation:complete' | 'flow:argument' | 'flow:state' | 'ballot:ready' | 'latency:update' | 'tts:start' | 'tts:audio_chunk' | 'tts:end' | 'tts:error' | 'voice:select' | 'voice:list:request' | 'voice:list';
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
    speakerName: string;
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
    speakerName: string;
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
export type ArgumentType = 'value' | 'criterion' | 'contention' | 'subpoint' | 'response' | 'rebuttal' | 'extension';
export type ArgumentStatus = 'introduced' | 'extended' | 'answered' | 'dropped' | 'turned';
export interface Argument {
    id: string;
    speech: SpeechRole;
    side: Side;
    title: string;
    claim: string;
    warrant: string;
    impact: string;
    type: ArgumentType;
    status: ArgumentStatus;
    respondsTo: string[];
    createdAt: number;
}
export interface FlowState {
    roomId: string;
    arguments: Argument[];
    speechTranscripts: Record<SpeechRole, string>;
}
export interface FlowStatePayload {
    flowState: FlowState;
}
export interface VotingIssue {
    issue: string;
    analysis: string;
    winner: Side;
}
export interface Ballot {
    roomId: string;
    resolution: string;
    generatedAt: number;
    winner: Side;
    winnerName: string;
    loserName: string;
    rfdSummary: string;
    rfdDetails: string;
    speakerPoints: {
        AFF: number;
        NEG: number;
    };
    votingIssues: VotingIssue[];
}
export interface BallotReadyPayload {
    ballot: Ballot;
    flowState: FlowState;
}
export interface VoiceConfig {
    voiceId: string;
    name: string;
    language: LanguageCode;
    previewUrl?: string;
    labels?: {
        accent?: string;
        age?: string;
        gender?: string;
        use_case?: string;
    };
}
export interface VoiceSettings {
    stability: number;
    similarity_boost: number;
    style: number;
    speed: number;
    use_speaker_boost: boolean;
}
export interface TTSRequest {
    text: string;
    voiceId: string;
    targetLanguage: LanguageCode;
    emotionHints?: EmotionMarkers;
}
export interface EmotionMarkers {
    dominantEmotion: 'neutral' | 'confident' | 'passionate' | 'aggressive' | 'measured' | 'uncertain';
    intensity: number;
    confidence: number;
    suggestedSettings?: VoiceSettings;
}
export interface TTSAudioChunkPayload {
    speakerId: string;
    speechId: string;
    chunkIndex: number;
    audioData: string;
    isFinal: boolean;
    timestamp: number;
}
export interface TTSStartPayload {
    speakerId: string;
    speechId: string;
    text: string;
}
export interface TTSEndPayload {
    speakerId: string;
    speechId: string;
}
export interface TTSErrorPayload {
    speakerId: string;
    speechId: string;
    error: string;
}
export interface VoiceSelectPayload {
    speakingVoiceId: string;
    listeningVoiceId?: string;
}
export interface VoiceListRequestPayload {
    language: LanguageCode;
}
export interface VoiceListPayload {
    voices: VoiceConfig[];
    language: LanguageCode;
}
//# sourceMappingURL=types.d.ts.map