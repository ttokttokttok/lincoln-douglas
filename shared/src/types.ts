// Language codes supported
export type LanguageCode = 'en' | 'ko' | 'ja' | 'es' | 'zh';

// Debate sides
export type Side = 'AFF' | 'NEG';

// Room status
export type RoomStatus = 'waiting' | 'ready' | 'in_progress' | 'completed';

// Speech roles in LD format
export type SpeechRole = 'AC' | 'NC' | '1AR' | 'NR' | '2AR';

// Participant in a room
export interface Participant {
  id: string;
  displayName: string;
  side: Side | null;
  speakingLanguage: LanguageCode;
  listeningLanguage: LanguageCode;
  isReady: boolean;
  isConnected: boolean;
}

// Room state (serializable version for transport)
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

// Timer state
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

// WebSocket message types
export type WSMessageType =
  | 'room:create'
  | 'room:join'
  | 'room:leave'
  | 'room:state'
  | 'room:ready'
  | 'room:start'
  | 'room:error'
  | 'participant:update'
  | 'participant:joined'
  | 'participant:left'
  | 'signal:offer'
  | 'signal:answer'
  | 'signal:ice'
  | 'timer:update'
  | 'timer:start'
  | 'timer:pause'
  | 'speech:start'
  | 'speech:end'
  | 'prep:start'
  | 'prep:end'
  | 'error'
  // Audio streaming (Milestone 2)
  | 'audio:start'
  | 'audio:chunk'
  | 'audio:stop'
  // STT results (Milestone 2)
  | 'stt:interim'
  | 'stt:final'
  // Translation results (Milestone 2)
  | 'translation:interim'
  | 'translation:complete'
  // Flow/Arguments (Milestone 2)
  | 'flow:argument'
  | 'flow:state'
  // Ballot (Milestone 2)
  | 'ballot:ready'
  // Latency metrics (Milestone 2)
  | 'latency:update';

// Base WebSocket message
export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
}

// Specific message payloads
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

// ==========================================
// Milestone 2: Audio/STT/Translation Types
// ==========================================

// Audio streaming payloads
export interface AudioStartPayload {
  speechId: string;
  language: LanguageCode;
}

export interface AudioChunkPayload {
  audioData: string;  // Base64 encoded PCM (16-bit, 16kHz, mono)
  timestamp: number;
  speechId: string;
}

export interface AudioStopPayload {
  speechId: string;
}

// Word-level timestamp from STT
export interface WordTimestamp {
  word: string;
  startTime: number;  // seconds
  endTime: number;    // seconds
  confidence: number;
}

// STT result payloads
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

// Translation payloads
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

// Latency update payload
export interface LatencyUpdatePayload {
  sttLatencyMs: number;
  translationLatencyMs: number;
}

// Language metadata
export interface LanguageInfo {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
];
