// ICE servers for NAT traversal
export const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN servers (free, reliable)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },

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

// Debate timing configurations (in seconds)
export const SPEECH_TIMES: Record<string, number> = {
  AC: 180,   // 3:00 - Affirmative Constructive
  NC: 240,   // 4:00 - Negative Constructive
  '1AR': 120, // 2:00 - First Affirmative Rebuttal
  NR: 180,   // 3:00 - Negative Rebuttal
  '2AR': 120, // 2:00 - Second Affirmative Rebuttal
};

export const PREP_TIME = 120; // 2:00 per side

// Speech order for LD debate
export const SPEECH_ORDER = ['AC', 'NC', '1AR', 'NR', '2AR'] as const;

// WebSocket server URL
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

// API server URL
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
