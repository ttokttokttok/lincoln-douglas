# Milestone 1 — Room + Video Infrastructure Implementation Plan

## Status: COMPLETE ✅

## Overview

This document details the implementation strategy for Milestone 1 of the Cross-Language Lincoln-Douglas Debate Platform. We're building the foundational infrastructure: room management, WebRTC video connections, timer system, and language selection.

---

## Current State

- **Status**: Milestone 1 Complete
- **Completed**: Room system, WebSocket, WebRTC P2P video/audio, Timer system, Debate flow

### What's Working Now
- ✅ Create room via REST API, get 6-char code
- ✅ Join room via WebSocket with code
- ✅ Real-time participant sync between clients
- ✅ Side selection (AFF/NEG) with conflict prevention
- ✅ Language selection (speaking/listening)
- ✅ Ready state sync - both users see when opponent is ready
- ✅ Zustand state management (roomStore.ts)
- ✅ WebSocket reconnection logic with StrictMode handling
- ✅ Camera/microphone access (useMediaStream hook)
- ✅ WebRTC peer connection (usePeer hook with native RTCPeerConnection)
- ✅ Video display (VideoPanel component)
- ✅ Signal queuing for async stream handling
- ✅ P2P video/audio connection between two clients
- ✅ Timer countdown with server-authoritative state
- ✅ Timer display (Timer component)
- ✅ Debate start flow (when both ready)
- ✅ Speech transitions (AC → NC → 1AR → NR → 2AR)
- ✅ Prep time tracking per side
- ✅ Only current speaker can end their speech
- ✅ Only next speaker can start their speech or use prep time

### MVP Format Notes
- **No cross-examination** - This MVP uses simplified LD format without CX periods
- Speech order: AC (3:00) → NC (4:00) → 1AR (2:00) → NR (3:00) → 2AR (2:00)
- Prep time: 2:00 per side

---

## Technology Stack Decisions

### Frontend
| Technology | Choice | Rationale |
|------------|--------|-----------|
| Build Tool | **Vite** | Fast HMR, native ES modules, excellent TypeScript support |
| Framework | **React 18 + TypeScript** | Type safety, modern hooks, great ecosystem |
| WebRTC | **Native RTCPeerConnection** | Direct browser API, no Node.js polyfill issues with Vite bundler |
| Styling | **Tailwind CSS** | Rapid UI development, consistent design system |
| State Management | **Zustand** | Lightweight, TypeScript-first, no boilerplate |

> **Note**: Originally planned to use simple-peer, but switched to native RTCPeerConnection due to Node.js polyfill issues (Buffer, process, global) when bundling with Vite. Native API works cleanly in browser environment.

### Backend
| Technology | Choice | Rationale |
|------------|--------|-----------|
| Runtime | **Node.js 20+** | Native TypeScript via tsx, excellent WebSocket support |
| WebSocket Library | **ws** | Raw performance (50K+ connections), low latency for real-time debate |
| HTTP Framework | **Express** or **Fastify** | Room REST endpoints, simple and proven |
| Language | **TypeScript** | Shared types between frontend/backend |

### Infrastructure
| Component | Choice | Rationale |
|-----------|--------|-----------|
| STUN Server | **Google STUN** (stun.l.google.com:19302) | Free, reliable |
| TURN Server | **Metered.ca Open Relay** | Free tier (20GB/month), TURN + STUN, TLS support |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Lobby     │  │  Pre-Debate │  │ Debate Room │  │   Results   │     │
│  │   Screen    │→ │   Setup     │→ │   (Main)    │→ │   Screen    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
│         │                │                │                              │
│         └────────────────┴────────────────┘                              │
│                          │                                               │
│              ┌───────────┴───────────┐                                   │
│              │      WebSocket        │ ← Room events, signaling          │
│              │      Connection       │                                   │
│              └───────────┬───────────┘                                   │
│                          │                                               │
│              ┌───────────┴───────────┐                                   │
│              │   RTCPeerConnection   │ ← Video/Audio streams (P2P)       │
│              │   (native browser API)│                                   │
│              └───────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           │ WebSocket (signaling + room state)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     WebSocket Server (ws)                        │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │    │
│  │  │ Room Manager │  │  Signaling   │  │   Timer Controller   │   │    │
│  │  │              │  │  Relay       │  │                      │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     REST API (Express/Fastify)                   │    │
│  │  POST /api/rooms         - Create room                           │    │
│  │  GET  /api/rooms/:id     - Get room state                        │    │
│  │  POST /api/rooms/:id/join - Join room                            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
lincoln-douglas/
├── client/                          # Frontend (Vite + React)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Lobby/
│   │   │   │   ├── CreateRoom.tsx
│   │   │   │   ├── JoinRoom.tsx
│   │   │   │   └── index.tsx
│   │   │   ├── PreDebate/
│   │   │   │   ├── LanguageSelector.tsx
│   │   │   │   ├── ReadyCheck.tsx
│   │   │   │   └── index.tsx
│   │   │   ├── DebateRoom/
│   │   │   │   ├── VideoPanel.tsx
│   │   │   │   ├── Timer.tsx
│   │   │   │   ├── Controls.tsx
│   │   │   │   └── index.tsx
│   │   │   └── shared/
│   │   │       ├── Button.tsx
│   │   │       └── Layout.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts      # WebSocket connection management
│   │   │   ├── usePeer.ts           # simple-peer wrapper
│   │   │   ├── useTimer.ts          # Countdown timer logic
│   │   │   ├── useRoom.ts           # Room state management
│   │   │   └── useMediaStream.ts    # Camera/mic access
│   │   ├── stores/
│   │   │   ├── roomStore.ts         # Zustand store for room state
│   │   │   └── userStore.ts         # User preferences, language
│   │   ├── types/
│   │   │   └── index.ts             # Shared TypeScript types
│   │   ├── lib/
│   │   │   ├── webrtc.ts            # WebRTC utilities
│   │   │   └── constants.ts         # ICE servers, timing configs
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── server/                          # Backend (Node.js)
│   ├── src/
│   │   ├── index.ts                 # Entry point
│   │   ├── websocket/
│   │   │   ├── server.ts            # WebSocket server setup
│   │   │   ├── handlers.ts          # Message handlers
│   │   │   └── signaling.ts         # WebRTC signaling relay
│   │   ├── rooms/
│   │   │   ├── manager.ts           # Room CRUD operations
│   │   │   ├── Room.ts              # Room class
│   │   │   └── types.ts             # Room-related types
│   │   ├── timer/
│   │   │   ├── controller.ts        # Timer logic
│   │   │   └── types.ts             # Speech roles, timing configs
│   │   ├── api/
│   │   │   └── routes.ts            # REST endpoints
│   │   └── types/
│   │       └── index.ts             # Shared types
│   ├── tsconfig.json
│   └── package.json
│
├── shared/                          # Shared code between client/server
│   ├── types.ts                     # Common TypeScript interfaces
│   ├── constants.ts                 # Shared constants
│   └── package.json
│
├── DEBATE_SYSTEM_PLAN.md
├── MILESTONE_1.md                   # This file
└── README.md
```

---

## Detailed Implementation Tasks

### Phase 1: Project Setup (Foundation)

#### 1.1 Initialize Monorepo Structure
```bash
# Create directories
mkdir -p client server shared

# Initialize root package.json for workspaces
npm init -y
```

**Root package.json:**
```json
{
  "name": "lincoln-douglas",
  "private": true,
  "workspaces": ["client", "server", "shared"],
  "scripts": {
    "dev": "concurrently \"npm run dev:client\" \"npm run dev:server\"",
    "dev:client": "npm run dev --workspace=client",
    "dev:server": "npm run dev --workspace=server"
  }
}
```

#### 1.2 Frontend Setup (Vite + React + TypeScript)
```bash
cd client
npm create vite@latest . -- --template react-ts
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Additional dependencies:**
```bash
npm install zustand simple-peer react-router-dom
npm install -D @types/simple-peer
```

#### 1.3 Backend Setup (Node.js + TypeScript)
```bash
cd server
npm init -y
npm install express ws uuid cors
npm install -D typescript tsx @types/node @types/express @types/ws @types/uuid @types/cors
npx tsc --init
```

---

### Phase 2: Room Management System

#### 2.1 Shared Types (shared/types.ts)

```typescript
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

// Room state
export interface Room {
  id: string;
  code: string;              // 6-char join code
  resolution: string;
  status: RoomStatus;
  hostId: string;
  participants: Map<string, Participant>;
  currentSpeaker: string | null;
  currentSpeech: SpeechRole | null;
  createdAt: number;
}

// Timer state
export interface TimerState {
  speechTimeRemaining: number;  // in seconds
  prepTime: {
    AFF: number;
    NEG: number;
  };
  isRunning: boolean;
  currentSpeech: SpeechRole | null;
}

// WebSocket message types
export type WSMessageType =
  | 'room:join'
  | 'room:leave'
  | 'room:state'
  | 'room:ready'
  | 'room:start'
  | 'participant:update'
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

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
  roomId?: string;
  senderId?: string;
}
```

#### 2.2 Room Manager (server/src/rooms/manager.ts)

```typescript
import { Room, Participant, RoomStatus } from '@shared/types';
import { v4 as uuid } from 'uuid';

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private codeToRoomId: Map<string, string> = new Map();

  // Generate 6-character room code
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return this.codeToRoomId.has(code) ? this.generateCode() : code;
  }

  createRoom(hostId: string, resolution: string): Room {
    const id = uuid();
    const code = this.generateCode();

    const room: Room = {
      id,
      code,
      resolution,
      status: 'waiting',
      hostId,
      participants: new Map(),
      currentSpeaker: null,
      currentSpeech: null,
      createdAt: Date.now(),
    };

    this.rooms.set(id, room);
    this.codeToRoomId.set(code, id);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByCode(code: string): Room | undefined {
    const roomId = this.codeToRoomId.get(code.toUpperCase());
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  addParticipant(roomId: string, participant: Participant): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.participants.size >= 2) return false;
    room.participants.set(participant.id, participant);
    return true;
  }

  removeParticipant(roomId: string, participantId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.participants.delete(participantId);

    // Clean up empty rooms
    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
      this.codeToRoomId.delete(room.code);
    }
  }

  updateParticipant(roomId: string, participantId: string, updates: Partial<Participant>): void {
    const room = this.rooms.get(roomId);
    const participant = room?.participants.get(participantId);
    if (participant) {
      Object.assign(participant, updates);
    }
  }

  setRoomStatus(roomId: string, status: RoomStatus): void {
    const room = this.rooms.get(roomId);
    if (room) room.status = status;
  }
}

export const roomManager = new RoomManager();
```

#### 2.3 WebSocket Server (server/src/websocket/server.ts)

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { WSMessage } from '@shared/types';
import { handleMessage } from './handlers';

interface ExtendedWebSocket extends WebSocket {
  id: string;
  roomId?: string;
  isAlive: boolean;
}

class SignalingServer {
  private wss: WebSocketServer;
  private clients: Map<string, ExtendedWebSocket> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupHeartbeat();
    this.setupConnectionHandler();
  }

  private setupHeartbeat(): void {
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const client = ws as ExtendedWebSocket;
        if (!client.isAlive) return client.terminate();
        client.isAlive = false;
        client.ping();
      });
    }, 30000);
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const client = ws as ExtendedWebSocket;
      client.id = crypto.randomUUID();
      client.isAlive = true;

      this.clients.set(client.id, client);

      client.on('pong', () => { client.isAlive = true; });

      client.on('message', (data) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          handleMessage(client, message, this);
        } catch (e) {
          this.sendError(client, 'Invalid message format');
        }
      });

      client.on('close', () => {
        this.handleDisconnect(client);
        this.clients.delete(client.id);
      });
    });
  }

  private handleDisconnect(client: ExtendedWebSocket): void {
    // Notify room participants of disconnect
    if (client.roomId) {
      this.broadcastToRoom(client.roomId, {
        type: 'participant:update',
        payload: { participantId: client.id, isConnected: false },
      }, client.id);
    }
  }

  // Send to specific client
  send(clientId: string, message: WSMessage): void {
    const client = this.clients.get(clientId);
    if (client?.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  // Broadcast to all clients in a room
  broadcastToRoom(roomId: string, message: WSMessage, excludeId?: string): void {
    this.clients.forEach((client) => {
      if (client.roomId === roomId && client.id !== excludeId) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      }
    });
  }

  // Send error message
  sendError(client: ExtendedWebSocket, error: string): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'error', payload: { error } }));
    }
  }

  getClient(clientId: string): ExtendedWebSocket | undefined {
    return this.clients.get(clientId);
  }
}

export { SignalingServer, ExtendedWebSocket };
```

---

### Phase 3: WebRTC Video Connection

#### 3.1 ICE Server Configuration (client/src/lib/constants.ts)

```typescript
// ICE servers for NAT traversal
export const ICE_SERVERS: RTCIceServer[] = [
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

// Debate timing configurations (in seconds)
export const SPEECH_TIMES: Record<string, number> = {
  AC: 180,   // 3:00
  NC: 240,   // 4:00
  '1AR': 120, // 2:00
  NR: 180,   // 3:00
  '2AR': 120, // 2:00
};

export const PREP_TIME = 120; // 2:00 per side

// Micro debate format (for quick demos)
export const MICRO_SPEECH_TIMES: Record<string, number> = {
  AC: 120,
  NC: 120,
  '1AR': 120,
  '2AR': 120,
};
```

#### 3.2 WebRTC Hook (client/src/hooks/usePeer.ts)

Uses native RTCPeerConnection API instead of simple-peer to avoid Node.js polyfill issues.

```typescript
import { useRef, useCallback, useEffect, useState } from 'react';
import { ICE_SERVERS } from '../lib/constants';

// Signal data type for WebRTC signaling
export interface SignalData {
  type: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

interface UsePeerOptions {
  localStream: MediaStream | null;
  onRemoteStream: (stream: MediaStream) => void;
  onSignal: (signal: SignalData) => void;
  onConnect?: () => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
}

export function usePeer(options: UsePeerOptions) {
  const { localStream, onRemoteStream, onSignal, onConnect, onClose, onError } = options;
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const [state, setState] = useState({ isConnecting: false, isConnected: false, error: null });

  // Create peer connection
  const createPeer = useCallback(async (initiator: boolean) => {
    if (!localStream) return null;

    // Cleanup existing peer
    if (peerRef.current) {
      peerRef.current.close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = pc;
    setState({ isConnecting: true, isConnected: false, error: null });

    // Add local tracks
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Handle incoming tracks
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        onRemoteStream(event.streams[0]);
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onSignal({ type: 'candidate', candidate: event.candidate.toJSON() });
      }
    };

    // Handle connection state
    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected':
          setState({ isConnecting: false, isConnected: true, error: null });
          onConnect?.();
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          setState({ isConnecting: false, isConnected: false, error: null });
          onClose?.();
          break;
      }
    };

    // If initiator, create and send offer
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      onSignal({ type: 'offer', sdp: offer.sdp });
    }

    return pc;
  }, [localStream, onSignal, onRemoteStream, onConnect, onClose]);

  // Handle incoming signal
  const signal = useCallback(async (data: SignalData) => {
    const pc = peerRef.current;
    if (!pc) return;

    if (data.type === 'offer') {
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      onSignal({ type: 'answer', sdp: answer.sdp });
    } else if (data.type === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    } else if (data.type === 'candidate' && data.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }, [onSignal]);

  const destroy = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
      setState({ isConnecting: false, isConnected: false, error: null });
    }
  }, []);

  useEffect(() => () => { peerRef.current?.close(); }, []);

  return { ...state, createPeer, signal, destroy };
}
```

#### 3.3 Media Stream Hook (client/src/hooks/useMediaStream.ts)

```typescript
import { useState, useCallback, useEffect } from 'react';

interface MediaStreamState {
  stream: MediaStream | null;
  error: Error | null;
  isLoading: boolean;
}

interface UseMediaStreamOptions {
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaTrackConstraints;
}

export function useMediaStream(options: UseMediaStreamOptions = { video: true, audio: true }) {
  const [state, setState] = useState<MediaStreamState>({
    stream: null,
    error: null,
    isLoading: false,
  });

  const getStream = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: options.video,
        audio: options.audio,
      });
      setState({ stream, error: null, isLoading: false });
      return stream;
    } catch (error) {
      setState({ stream: null, error: error as Error, isLoading: false });
      throw error;
    }
  }, [options.video, options.audio]);

  const stopStream = useCallback(() => {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      setState({ stream: null, error: null, isLoading: false });
    }
  }, [state.stream]);

  const toggleVideo = useCallback((enabled: boolean) => {
    if (state.stream) {
      state.stream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }, [state.stream]);

  const toggleAudio = useCallback((enabled: boolean) => {
    if (state.stream) {
      state.stream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }, [state.stream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    ...state,
    getStream,
    stopStream,
    toggleVideo,
    toggleAudio,
  };
}
```

---

### Phase 4: Timer System

#### 4.1 Timer Hook (client/src/hooks/useTimer.ts)

```typescript
import { useState, useRef, useCallback, useEffect } from 'react';

interface UseTimerOptions {
  initialTime: number;        // in seconds
  onComplete?: () => void;
  onTick?: (remaining: number) => void;
}

interface TimerControls {
  timeRemaining: number;
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: (newTime?: number) => void;
  setTime: (time: number) => void;
}

export function useTimer(options: UseTimerOptions): TimerControls {
  const { initialTime, onComplete, onTick } = options;

  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(initialTime);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (isRunning) return;

    clearTimer();
    startTimeRef.current = Date.now();
    pausedTimeRef.current = timeRemaining;
    setIsRunning(true);

    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, pausedTimeRef.current - elapsed);

      setTimeRemaining(remaining);
      onTick?.(remaining);

      if (remaining <= 0) {
        clearTimer();
        setIsRunning(false);
        onComplete?.();
      }
    }, 100); // Update every 100ms for smooth display
  }, [isRunning, timeRemaining, clearTimer, onComplete, onTick]);

  const pause = useCallback(() => {
    if (!isRunning) return;

    clearTimer();
    pausedTimeRef.current = timeRemaining;
    setIsRunning(false);
  }, [isRunning, timeRemaining, clearTimer]);

  const resume = useCallback(() => {
    start();
  }, [start]);

  const reset = useCallback((newTime?: number) => {
    clearTimer();
    const time = newTime ?? initialTime;
    setTimeRemaining(time);
    pausedTimeRef.current = time;
    setIsRunning(false);
  }, [clearTimer, initialTime]);

  const setTime = useCallback((time: number) => {
    setTimeRemaining(time);
    pausedTimeRef.current = time;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return {
    timeRemaining,
    isRunning,
    start,
    pause,
    resume,
    reset,
    setTime,
  };
}

// Helper to format seconds to MM:SS
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

#### 4.2 Server-Side Timer Controller (server/src/timer/controller.ts)

```typescript
import { SpeechRole, TimerState, Side } from '@shared/types';
import { SPEECH_TIMES, PREP_TIME } from '@shared/constants';

interface TimerCallback {
  onTick: (state: TimerState) => void;
  onComplete: (speech: SpeechRole) => void;
}

class TimerController {
  private state: TimerState;
  private interval: NodeJS.Timeout | null = null;
  private callbacks: TimerCallback;

  constructor(callbacks: TimerCallback) {
    this.callbacks = callbacks;
    this.state = {
      speechTimeRemaining: 0,
      prepTime: { AFF: PREP_TIME, NEG: PREP_TIME },
      isRunning: false,
      currentSpeech: null,
    };
  }

  startSpeech(speech: SpeechRole): void {
    this.stopTimer();
    this.state.currentSpeech = speech;
    this.state.speechTimeRemaining = SPEECH_TIMES[speech];
    this.state.isRunning = true;
    this.startInterval();
  }

  startPrep(side: Side): void {
    if (this.state.prepTime[side] <= 0) return;

    this.stopTimer();
    this.state.currentSpeech = null;
    this.state.isRunning = true;
    this.startPrepInterval(side);
  }

  private startInterval(): void {
    this.interval = setInterval(() => {
      if (this.state.speechTimeRemaining > 0) {
        this.state.speechTimeRemaining--;
        this.callbacks.onTick({ ...this.state });
      } else {
        this.stopTimer();
        if (this.state.currentSpeech) {
          this.callbacks.onComplete(this.state.currentSpeech);
        }
      }
    }, 1000);
  }

  private startPrepInterval(side: Side): void {
    this.interval = setInterval(() => {
      if (this.state.prepTime[side] > 0) {
        this.state.prepTime[side]--;
        this.callbacks.onTick({ ...this.state });
      } else {
        this.stopTimer();
      }
    }, 1000);
  }

  pause(): void {
    this.stopTimer();
    this.state.isRunning = false;
  }

  resume(): void {
    if (this.state.speechTimeRemaining > 0 || this.state.currentSpeech) {
      this.state.isRunning = true;
      this.startInterval();
    }
  }

  private stopTimer(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.state.isRunning = false;
  }

  getState(): TimerState {
    return { ...this.state };
  }

  destroy(): void {
    this.stopTimer();
  }
}

export { TimerController };
```

---

### Phase 5: UI Components

#### 5.1 Language Selector (client/src/components/PreDebate/LanguageSelector.tsx)

```typescript
import { LanguageCode } from '@shared/types';

interface LanguageSelectorProps {
  speakingLanguage: LanguageCode;
  listeningLanguage: LanguageCode;
  onSpeakingChange: (lang: LanguageCode) => void;
  onListeningChange: (lang: LanguageCode) => void;
}

const LANGUAGES: { code: LanguageCode; name: string; flag: string }[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
];

export function LanguageSelector({
  speakingLanguage,
  listeningLanguage,
  onSpeakingChange,
  onListeningChange,
}: LanguageSelectorProps) {
  return (
    <div className="space-y-6">
      {/* Speaking Language */}
      <div>
        <label className="block text-sm font-medium mb-2">
          I will speak in:
        </label>
        <div className="grid grid-cols-5 gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={`speak-${lang.code}`}
              onClick={() => onSpeakingChange(lang.code)}
              className={`
                p-3 rounded-lg border-2 transition-all
                ${speakingLanguage === lang.code
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
                }
              `}
            >
              <div className="text-2xl mb-1">{lang.flag}</div>
              <div className="text-xs">{lang.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Listening Language */}
      <div>
        <label className="block text-sm font-medium mb-2">
          I want to hear my opponent in:
        </label>
        <div className="grid grid-cols-5 gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={`listen-${lang.code}`}
              onClick={() => onListeningChange(lang.code)}
              className={`
                p-3 rounded-lg border-2 transition-all
                ${listeningLanguage === lang.code
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
                }
              `}
            >
              <div className="text-2xl mb-1">{lang.flag}</div>
              <div className="text-xs">{lang.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

#### 5.2 Timer Display (client/src/components/DebateRoom/Timer.tsx)

```typescript
import { formatTime } from '../../hooks/useTimer';
import { SpeechRole, Side } from '@shared/types';

interface TimerProps {
  speechTime: number;
  currentSpeech: SpeechRole | null;
  prepTime: { AFF: number; NEG: number };
  mySide: Side;
  isRunning: boolean;
  onEndSpeech: () => void;
  onUsePrep: () => void;
  onEndPrep: () => void;
}

export function Timer({
  speechTime,
  currentSpeech,
  prepTime,
  mySide,
  isRunning,
  onEndSpeech,
  onUsePrep,
  onEndPrep,
}: TimerProps) {
  const isLowTime = speechTime <= 30;
  const isCriticalTime = speechTime <= 10;

  return (
    <div className="bg-gray-900 text-white rounded-xl p-6">
      {/* Main Timer Display */}
      <div className="text-center mb-4">
        {currentSpeech && (
          <div className="text-sm text-gray-400 mb-1">
            {currentSpeech}
          </div>
        )}
        <div
          className={`
            text-6xl font-mono font-bold
            ${isCriticalTime ? 'text-red-500 animate-pulse' : ''}
            ${isLowTime && !isCriticalTime ? 'text-yellow-400' : ''}
          `}
        >
          {formatTime(speechTime)}
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2 justify-center mb-4">
        {isRunning ? (
          <button
            onClick={onEndSpeech}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium"
          >
            End Speech
          </button>
        ) : (
          <button
            onClick={onUsePrep}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
            disabled={prepTime[mySide] <= 0}
          >
            Use Prep
          </button>
        )}
      </div>

      {/* Prep Time Display */}
      <div className="flex justify-between text-sm">
        <div className={mySide === 'AFF' ? 'text-blue-400' : 'text-gray-400'}>
          AFF Prep: {formatTime(prepTime.AFF)}
        </div>
        <div className={mySide === 'NEG' ? 'text-red-400' : 'text-gray-400'}>
          NEG Prep: {formatTime(prepTime.NEG)}
        </div>
      </div>
    </div>
  );
}
```

---

## WebSocket Protocol

### Message Flow for Room Joining

```
Client A (Host)                    Server                    Client B (Guest)
     |                               |                             |
     |-- room:create --------------->|                             |
     |<-- room:state (code) ---------|                             |
     |                               |                             |
     |                               |<-- room:join (code) --------|
     |<-- room:state (2 participants)|                             |
     |                               |-- room:state (2 participants)->|
     |                               |                             |
```

### Signaling Flow for WebRTC

```
Client A (Initiator)               Server                    Client B (Responder)
     |                               |                             |
     | [localStream ready]           |                             |
     |-- signal:offer (SDP) -------->|                             |
     |-- signal:ice (candidate) ---->|                             |
     |-- signal:ice (candidate) ---->|                             |
     |                               |-- signal:offer ------------>| [queued if no stream]
     |                               |-- signal:ice -------------->| [queued if no stream]
     |                               |-- signal:ice -------------->| [queued if no stream]
     |                               |                             |
     |                               |                             | [localStream ready]
     |                               |                             | [process queued signals]
     |                               |                             | [create responder peer]
     |                               |<-- signal:answer -----------|
     |<-- signal:answer -------------|                             |
     |                               |                             |
     |                               |<-- signal:ice --------------|
     |<-- signal:ice ----------------|                             |
     |                               |                             |
     |<============ P2P VIDEO CONNECTED =========================>|
```

#### Signal Queuing Pattern

Signals may arrive before the local media stream is ready (camera permission async). The Room component queues these signals and processes them once `localStream` is available:

```typescript
// In Room.tsx
const pendingSignalsRef = useRef<Array<{ senderId: string; signal: unknown }>>([]);

const handleSignal = useCallback(async (message) => {
  if (!localStream) {
    // Queue signal for later processing
    pendingSignalsRef.current.push(message);
    return;
  }
  await processSignal(message.signal);
}, [localStream, processSignal]);

// Process queued signals when stream becomes available
useEffect(() => {
  if (localStream && pendingSignalsRef.current.length > 0) {
    const pending = [...pendingSignalsRef.current];
    pendingSignalsRef.current = [];
    pending.forEach(msg => processSignal(msg.signal));
  }
}, [localStream, processSignal]);
```

#### Signal Routing

Different signal types are sent via different WebSocket message types:
- `signal:offer` - SDP offer from initiator
- `signal:answer` - SDP answer from responder
- `signal:ice` - ICE candidates (both directions)

---

## Testing Strategy

### Unit Tests
- Timer hook accuracy
- Room manager CRUD operations
- WebSocket message handling

### Integration Tests
- Room creation → join → ready flow
- WebRTC signaling through server
- Timer sync between clients

### Manual Testing Checklist
- [x] Create room, get shareable code
- [x] Join room with code
- [x] Both users see each other's video
- [x] Both users hear each other's audio
- [x] Language selection persists
- [x] Timer counts down accurately
- [x] Timer syncs between both clients
- [x] Prep time deducts correctly
- [x] Speech transitions work (AC → NC → 1AR → NR → 2AR)
- [x] Only current speaker can end their speech
- [x] Only next speaker can use prep time or start speech

---

## Implementation Order

1. **Phase 1: Foundation** ✅ COMPLETE
   - [x] Set up monorepo structure
   - [x] Initialize Vite + React frontend
   - [x] Initialize Node.js + Express backend
   - [x] Create shared types package

2. **Phase 2: Room System** ✅ COMPLETE
   - [x] Implement RoomManager class
   - [x] Build WebSocket server with ws
   - [x] Create room REST endpoints
   - [x] Build Lobby UI (create/join room)
   - [x] Implement Zustand room store
   - [x] Implement useWebSocket hook (with StrictMode handling)
   - [x] Build Room component with side/language selection
   - [x] Implement ready state sync

3. **Phase 3: WebRTC Video** ✅ COMPLETE
   - [x] Implement useMediaStream hook
   - [x] Implement usePeer hook (native RTCPeerConnection, not simple-peer)
   - [x] Add signaling handlers to WebSocket server
   - [x] Build VideoPanel component
   - [x] Implement signal queuing for async stream handling
   - [x] Implement proper signal routing (offer/answer/ice)
   - [x] Test P2P video connection between two clients
   - [x] **Fix: Peer connection race condition** - Added retry mechanism for peer initiation (see note below)

   > **Note on Peer Connection Timing (2024-12-26):** Fixed an issue where video connection would be delayed by minutes if debaters didn't select their sides immediately. The root cause was a race condition between `localStream` becoming ready and `room` state updates. The peer connection initiation effect depends on both conditions being true, but they can update at different times. The person with the "higher" ID (lexicographic UUID comparison) is responsible for initiating, but if their `localStream` wasn't ready when the opponent joined, the effect wouldn't trigger reliably. **Fix:** Added a 500ms retry mechanism that continues trying to initiate the peer connection for up to 5 seconds after both conditions are met. This ensures the connection happens regardless of the exact timing of state updates.

4. **Phase 4: Timer + Debate Flow** ✅ COMPLETE
   - [x] Implement useTimer hook
   - [x] Build Timer component
   - [x] Add server-side timer controller (TimerController + DebateManager)
   - [x] Implement debate start flow
   - [x] Implement speech transitions (AC → NC → 1AR → NR → 2AR)
   - [x] Implement prep time tracking per side
   - [x] Add permission controls (only speaker can end speech, only next speaker can start)

5. **Phase 5: Integration + Polish** ✅ COMPLETE
   - [x] Full flow testing
   - [x] Error handling improvements
   - [x] UI polish

---

## Key Dependencies

```json
// client/package.json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "tailwindcss": "^3.4.0"
  }
}
// Note: No simple-peer - using native RTCPeerConnection API

// server/package.json
{
  "dependencies": {
    "express": "^4.21.0",
    "ws": "^8.18.0",
    "uuid": "^11.0.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/ws": "^8.5.0",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.7.0",
    "tsx": "^4.19.0"
  }
}
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| WebSocket connection drops | Added client-side keepalive pings (25s) + lenient server heartbeat (3 missed pings = 90s before disconnect). See note below. |
| WebRTC fails behind strict NAT | Use TURN server (Metered.ca) as fallback |
| High latency | Measure and display latency; accept ~200ms for signaling |
| Browser compatibility | Test Chrome, Firefox, Safari; simple-peer handles most edge cases |
| Timer drift | Server is source of truth; clients sync on reconnect |
| Room state lost on crash | Accept for MVP; add Redis persistence later |

> **Note on Connection Stability (2024-12-26):** Fixed WebSocket disconnection issues caused by aggressive server heartbeat. The original implementation terminated clients after just ONE missed ping (30s), which was too aggressive for:
> - Browser tabs in background (browsers throttle inactive tabs)
> - Momentary network hiccups
> - Slow WebSocket ping/pong processing
>
> **Fixes applied:**
> 1. **Server heartbeat tolerance**: Now allows 3 missed pings (90 seconds total) before terminating
> 2. **Client keepalive**: Client sends `ping` messages every 25 seconds to proactively keep connection alive
> 3. **Server ping handler**: Responds with `pong` and resets missed ping counter

---

## Success Criteria

Milestone 1 is complete! ✅

1. ✅ Two users can create/join a room via shareable code
2. ✅ Both users see each other's live video feed
3. ✅ Both users hear each other's audio
4. ✅ Users can select speaking and listening languages
5. ✅ Timer displays and counts down for each speech
6. ✅ Prep time tracking works correctly
7. ✅ Basic controls (end speech, use prep) function
8. ✅ Works across different networks (STUN/TURN configured)
9. ✅ Permission controls prevent unauthorized actions

---

## References

- [MDN WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) - Native WebRTC documentation
- [RTCPeerConnection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection) - Core WebRTC class we use
- [ws library documentation](https://github.com/websockets/ws)
- [Metered.ca Open Relay](https://www.metered.ca/tools/openrelay/)
- [Vite Getting Started](https://vite.dev/guide/)
- [WebRTC + React Guide](https://www.videosdk.live/developer-hub/webrtc/webrtc-react)

> **Note**: We originally planned to use simple-peer but switched to native RTCPeerConnection due to Node.js polyfill issues (Buffer, process, global) when bundling with Vite.
