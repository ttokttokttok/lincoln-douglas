// Language codes supported (Gemini 2.0 Flash supports 100+ languages)
export type LanguageCode = 
  // Major Languages
  | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ru' | 'zh' | 'ja' | 'ko'
  // European
  | 'nl' | 'pl' | 'uk' | 'cs' | 'ro' | 'hu' | 'el' | 'sv' | 'da' | 'fi' | 'no' | 'bg' | 'hr' | 'sk' | 'sl' | 'et' | 'lv' | 'lt'
  // Asian
  | 'hi' | 'bn' | 'ta' | 'te' | 'mr' | 'gu' | 'kn' | 'ml' | 'pa' | 'th' | 'vi' | 'id' | 'ms' | 'tl' | 'my' | 'km' | 'lo'
  // Middle Eastern
  | 'ar' | 'he' | 'fa' | 'tr' | 'ur'
  // African
  | 'sw' | 'am' | 'ha' | 'yo' | 'ig' | 'zu'
  // Other
  | 'af' | 'sq' | 'hy' | 'az' | 'eu' | 'be' | 'bs' | 'ca' | 'cy' | 'eo' | 'gl' | 'ka' | 'is' | 'mk' | 'mn' | 'ne' | 'ps' | 'si' | 'so' | 'tg' | 'uz' | 'xh';

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
  | 'latency:update'
  // TTS (Milestone 3)
  | 'tts:start'           // Server -> Client: TTS generation starting
  | 'tts:audio_chunk'     // Server -> Client: Audio data chunk
  | 'tts:end'             // Server -> Client: TTS generation complete
  | 'tts:error'           // Server -> Client: TTS error occurred
  | 'voice:select'        // Client -> Server: User selected a voice
  | 'voice:list:request'  // Client -> Server: Request available voices
  | 'voice:list'          // Server -> Client: Available voices
  // Timeout management (Milestone 3)
  | 'debate:timeout_warning'  // Server -> Client: Warning before auto-end
  | 'debate:timeout_end';     // Server -> Client: Debate ended due to timeout

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
  // Major Languages (most common first)
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  // European
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', flag: '🇷🇴' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', flag: '🇭🇺' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', flag: '🇩🇰' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', flag: '🇫🇮' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', flag: '🇳🇴' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', flag: '🇧🇬' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', flag: '🇭🇷' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', flag: '🇸🇰' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', flag: '🇸🇮' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', flag: '🇪🇪' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', flag: '🇱🇻' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', flag: '🇱🇹' },
  // Asian
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'tl', name: 'Filipino', nativeName: 'Tagalog', flag: '🇵🇭' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာ', flag: '🇲🇲' },
  { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ', flag: '🇰🇭' },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ', flag: '🇱🇦' },
  // Middle Eastern
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', flag: '🇮🇷' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰' },
  // African
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flag: '🇰🇪' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', flag: '🇪🇹' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', flag: '🇳🇬' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', flag: '🇳🇬' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo', flag: '🇳🇬' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', flag: '🇿🇦' },
  // Other
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', flag: '🇿🇦' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip', flag: '🇦🇱' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերdelays', flag: '🇦🇲' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan', flag: '🇦🇿' },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara', flag: '🇪🇸' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская', flag: '🇧🇾' },
  { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski', flag: '🇧🇦' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català', flag: '🇪🇸' },
  { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
  { code: 'eo', name: 'Esperanto', nativeName: 'Esperanto', flag: '🌍' },
  { code: 'gl', name: 'Galician', nativeName: 'Galego', flag: '🇪🇸' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', flag: '🇬🇪' },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska', flag: '🇮🇸' },
  { code: 'mk', name: 'Macedonian', nativeName: 'Македонски', flag: '🇲🇰' },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол', flag: '🇲🇳' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', flag: '🇳🇵' },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو', flag: '🇦🇫' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', flag: '🇱🇰' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaali', flag: '🇸🇴' },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ', flag: '🇹🇯' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek', flag: '🇺🇿' },
  { code: 'xh', name: 'Xhosa', nativeName: 'isiXhosa', flag: '🇿🇦' },
];

// ==========================================
// Milestone 2: Argument Extraction & Flow
// ==========================================

// Argument types for debate flow
export type ArgumentType = 
  | 'value'       // Core value (e.g., "Justice")
  | 'criterion'   // Standard for evaluation
  | 'contention'  // Main argument
  | 'subpoint'    // Supporting point under contention
  | 'response'    // Direct response to opponent's argument
  | 'rebuttal'    // Attack on opponent's reasoning
  | 'extension';  // Extending own prior argument

// Argument status in the flow
export type ArgumentStatus = 
  | 'introduced'  // First raised
  | 'extended'    // Carried forward by same side
  | 'answered'    // Responded to by opponent
  | 'dropped'     // Not addressed when it should have been
  | 'turned';     // Argument used against the side that made it

// Claim-Warrant-Impact structure
export interface Argument {
  id: string;
  speech: SpeechRole;
  side: Side;
  
  // Argument content (in English for consistency)
  title: string;          // Short label (e.g., "V: Justice", "C1: Dignity")
  claim: string;          // The assertion being made
  warrant: string;        // Evidence/reasoning supporting the claim
  impact: string;         // Why this matters / consequence
  
  // Classification
  type: ArgumentType;
  status: ArgumentStatus;
  
  // Relationships
  respondsTo: string[];   // IDs of arguments this responds to
  
  // Timestamps
  createdAt: number;
}

// Flow state for a debate room
export interface FlowState {
  roomId: string;
  arguments: Argument[];
  
  // Speech transcripts (accumulated for extraction)
  speechTranscripts: Record<SpeechRole, string>;
}

// Flow state payload for WebSocket
export interface FlowStatePayload {
  flowState: FlowState;
}

// ==========================================
// Milestone 2: Ballot Generation
// ==========================================

// Voting issue in the ballot
export interface VotingIssue {
  issue: string;          // Name of the clash point
  analysis: string;       // How each side handled it
  winner: Side;           // Who won this issue
}

// Generated ballot
export interface Ballot {
  roomId: string;
  resolution: string;
  generatedAt: number;
  
  // Decision
  winner: Side;
  winnerName: string;
  loserName: string;
  
  // Reason for Decision
  rfdSummary: string;     // One sentence
  rfdDetails: string;     // Full explanation
  
  // Speaker Points (25-30 scale)
  speakerPoints: {
    AFF: number;
    NEG: number;
  };
  
  // Key voting issues
  votingIssues: VotingIssue[];
}

// Ballot ready payload for WebSocket
export interface BallotReadyPayload {
  ballot: Ballot;
  flowState: FlowState;
}

// ==========================================
// Milestone 3: ElevenLabs TTS Types
// ==========================================

// ElevenLabs voice configuration
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

// Voice settings for TTS
// Based on ElevenLabs best practices: https://elevenlabs.io/docs/agents-platform/customization/voice/best-practices/conversational-voice-design
export interface VoiceSettings {
  stability: number;         // 0-1, recommended: 0.50-0.65 for debate (balance expressiveness/reliability)
  similarity_boost: number;  // 0-1, recommended: 0.70-0.80 (high clarity without distortion)
  style: number;             // 0-1, KEEP AT 0 - ElevenLabs recommends 0 for stability
  speed: number;             // 0.7-1.2, recommended: 0.95-1.05 for natural conversation
  use_speaker_boost: boolean; // true for enhanced clarity
}

// TTS request configuration
export interface TTSRequest {
  text: string;
  voiceId: string;
  targetLanguage: LanguageCode;
  emotionHints?: EmotionMarkers;
}

// Emotion markers for voice modulation
export interface EmotionMarkers {
  dominantEmotion: 'neutral' | 'confident' | 'passionate' | 'aggressive' | 'measured' | 'uncertain';
  intensity: number;      // 0-1
  confidence: number;     // 0-1
  suggestedSettings?: VoiceSettings;
}

// TTS audio chunk payload
export interface TTSAudioChunkPayload {
  speakerId: string;
  speechId: string;
  chunkIndex: number;
  audioData: string;      // Base64 encoded MP3 chunk
  isFinal: boolean;
  timestamp: number;
}

// TTS start payload
export interface TTSStartPayload {
  speakerId: string;
  speechId: string;
  text: string;
}

// TTS end payload
export interface TTSEndPayload {
  speakerId: string;
  speechId: string;
}

// TTS error payload
export interface TTSErrorPayload {
  speakerId: string;
  speechId: string;
  error: string;
}

// Voice selection payload
export interface VoiceSelectPayload {
  speakingVoiceId: string;    // Voice for when I speak (others hear)
  listeningVoiceId?: string;  // Preferred voice for opponent (optional)
}

// Voice list request payload
export interface VoiceListRequestPayload {
  language: LanguageCode;
}

// Voice list response payload
export interface VoiceListPayload {
  voices: VoiceConfig[];
  language: LanguageCode;
}

// ==========================================
// Timeout Management Types
// ==========================================

export type TimeoutReason = 'inactivity' | 'max_duration';

// Timeout warning payload
export interface TimeoutWarningPayload {
  reason: TimeoutReason;
  secondsRemaining: number;  // Seconds until auto-end
  message: string;
}

// Timeout end payload
export interface TimeoutEndPayload {
  reason: TimeoutReason;
  message: string;
}
