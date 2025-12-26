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

// Determine URLs based on environment
const getBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // In production, use same origin
  if (import.meta.env.PROD) {
    return `${window.location.origin}/api`;
  }
  // Development fallback
  return 'http://localhost:3001/api';
};

const getWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  // In production, derive from current host
  if (import.meta.env.PROD) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  // Development fallback
  return 'ws://localhost:3001/ws';
};

// WebSocket server URL
export const WS_URL = getWsUrl();

// API server URL
export const API_URL = getBaseUrl();
