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
  | 'error';

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
