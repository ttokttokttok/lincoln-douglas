import type { SpeechRole } from './types.js';

// ICE server configuration interface (browser-compatible)
interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// ICE servers for NAT traversal
export const ICE_SERVERS: IceServer[] = [
  // Google STUN servers (free, reliable)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },

  // Metered.ca Open Relay TURN server (free tier)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// Speech times in seconds (Quick LD format)
export const SPEECH_TIMES: Record<SpeechRole, number> = {
  AC: 180,    // 3:00 - Affirmative Constructive
  NC: 240,    // 4:00 - Negative Constructive
  '1AR': 120, // 2:00 - First Affirmative Rebuttal
  NR: 180,    // 3:00 - Negative Rebuttal
  '2AR': 120, // 2:00 - Second Affirmative Rebuttal
};

// Micro debate format (for quick demos)
export const MICRO_SPEECH_TIMES: Record<SpeechRole, number> = {
  AC: 120,    // 2:00
  NC: 120,    // 2:00
  '1AR': 120, // 2:00
  NR: 120,    // 2:00
  '2AR': 120, // 2:00
};

// Prep time per side in seconds
export const PREP_TIME = 120; // 2:00

// Speech order for LD debate
export const SPEECH_ORDER: SpeechRole[] = ['AC', 'NC', '1AR', 'NR', '2AR'];

// Which side gives each speech
export const SPEECH_SIDES: Record<SpeechRole, 'AFF' | 'NEG'> = {
  AC: 'AFF',
  NC: 'NEG',
  '1AR': 'AFF',
  NR: 'NEG',
  '2AR': 'AFF',
};

// WebSocket reconnection settings
export const WS_RECONNECT_INTERVAL = 1000;
export const WS_MAX_RECONNECT_ATTEMPTS = 5;

// Room settings
export const MAX_ROOM_PARTICIPANTS = 2;
export const ROOM_CODE_LENGTH = 6;
