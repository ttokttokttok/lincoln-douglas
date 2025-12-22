import { useEffect, useRef, useCallback } from 'react';
import { useRoomStore } from '../stores/roomStore';
import type {
  WSMessage,
  WSMessageType,
  RoomStatePayload,
  TimerUpdatePayload,
  ErrorPayload,
  SpeechStartPayload,
  SpeechRole,
  Side,
} from '@shared/types';

const WS_URL = 'ws://localhost:3001/ws';
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

interface SignalMessage {
  senderId: string;
  signal: unknown;
}

interface UseWebSocketOptions {
  roomCode: string;
  displayName: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSignal?: (message: SignalMessage) => void;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const { roomCode, displayName, onConnect, onDisconnect, onSignal } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    setConnected,
    setConnecting,
    setConnectionError,
    setRoom,
    setMyParticipantId,
    setTimer,
    setPendingNextSpeech,
    reset,
  } = useRoomStore();

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WSMessage = JSON.parse(event.data);
      console.log('[WS] Received:', message.type, message.payload);

      switch (message.type) {
        case 'room:state': {
          const payload = message.payload as RoomStatePayload & { yourParticipantId?: string };
          setRoom(payload.room);
          if (payload.yourParticipantId) {
            setMyParticipantId(payload.yourParticipantId);
          }
          break;
        }

        case 'participant:joined':
        case 'participant:left':
        case 'participant:update': {
          // Room state will be sent with these, handled by room:state
          const payload = message.payload as RoomStatePayload;
          if (payload.room) {
            setRoom(payload.room);
          }
          break;
        }

        case 'timer:update': {
          const payload = message.payload as TimerUpdatePayload;
          setTimer(payload.timer);
          break;
        }

        case 'room:error':
        case 'error': {
          const payload = message.payload as ErrorPayload;
          setConnectionError(payload.message);
          console.error('[WS] Error:', payload.message);
          break;
        }

        case 'signal:offer':
        case 'signal:answer':
        case 'signal:ice': {
          const payload = message.payload as SignalMessage;
          console.log('[WS] Signal received:', message.type, 'from', payload.senderId);
          onSignal?.(payload);
          break;
        }

        case 'speech:start': {
          const payload = message.payload as SpeechStartPayload;
          console.log('[WS] Speech started:', payload.speech, 'by', payload.speakerId);
          // Clear pending next speech when a new speech starts
          setPendingNextSpeech(null);
          break;
        }

        case 'speech:end': {
          const payload = message.payload as { speech: string; nextSpeech: SpeechRole | null };
          console.log('[WS] Speech ended:', payload.speech, 'next:', payload.nextSpeech);
          // Store the next speech so Timer component knows what's coming
          setPendingNextSpeech(payload.nextSpeech);
          break;
        }

        default:
          console.log('[WS] Unhandled message type:', message.type);
      }
    } catch (error) {
      console.error('[WS] Failed to parse message:', error);
    }
  }, [setRoom, setTimer, setConnectionError, setMyParticipantId, setPendingNextSpeech, onSignal]);

  // Send a message
  const send = useCallback((type: WSMessageType, payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: WSMessage = { type, payload };
      wsRef.current.send(JSON.stringify(message));
      console.log('[WS] Sent:', type, payload);
    } else {
      console.warn('[WS] Cannot send, socket not open');
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Clear any previous state
    setConnecting(true);
    setConnectionError(null);
    setConnected(false);

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // Double-check this is still our active socket (StrictMode protection)
      if (wsRef.current !== ws) {
        ws.close();
        return;
      }

      console.log('[WS] Connected');
      setConnected(true);
      setConnecting(false);
      setConnectionError(null); // Clear any previous errors
      reconnectAttempts.current = 0;

      // Join the room directly (not via send() to avoid race condition)
      const message = {
        type: 'room:join',
        payload: { code: roomCode, displayName: displayName },
      };
      ws.send(JSON.stringify(message));
      console.log('[WS] Sent: room:join', message.payload);

      onConnect?.();
    };

    ws.onmessage = handleMessage;

    ws.onclose = (event) => {
      // Only handle if this is our active socket
      if (wsRef.current !== ws) {
        return;
      }

      console.log('[WS] Disconnected:', event.code, event.reason);
      setConnected(false);
      wsRef.current = null;
      onDisconnect?.();

      // Attempt reconnection if not intentional close
      if (event.code !== 1000 && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current++;
        console.log(`[WS] Reconnecting... attempt ${reconnectAttempts.current}`);
        reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
      }
    };

    ws.onerror = (error) => {
      // Only set error if this is our active socket
      if (wsRef.current === ws) {
        console.error('[WS] Error:', error);
        setConnectionError('Connection failed');
      }
    };
  }, [roomCode, displayName, handleMessage, send, setConnected, setConnecting, setConnectionError, onConnect, onDisconnect]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const ws = wsRef.current;
    wsRef.current = null; // Clear ref first to prevent onclose handler from running

    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close(1000, 'User disconnected');
    }

    reset();
  }, [reset]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (roomCode && displayName) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [roomCode, displayName]);

  // Room actions
  const setReady = useCallback((isReady: boolean) => {
    send('room:ready', { isReady });
  }, [send]);

  const setSide = useCallback((side: 'AFF' | 'NEG') => {
    send('participant:update', { side });
  }, [send]);

  const setLanguages = useCallback((speakingLanguage: string, listeningLanguage: string) => {
    send('participant:update', { speakingLanguage, listeningLanguage });
  }, [send]);

  const startDebate = useCallback(() => {
    send('room:start', {});
  }, [send]);

  // Timer/Speech control
  const endSpeech = useCallback(() => {
    send('speech:end', {});
  }, [send]);

  const startNextSpeech = useCallback(() => {
    send('speech:start', {});
  }, [send]);

  const pauseTimer = useCallback(() => {
    send('timer:pause', {});
  }, [send]);

  const resumeTimer = useCallback(() => {
    send('timer:start', {});
  }, [send]);

  const startPrep = useCallback((side: Side) => {
    send('prep:start', { side });
  }, [send]);

  const endPrep = useCallback(() => {
    send('prep:end', {});
  }, [send]);

  // Signaling for WebRTC
  const sendSignal = useCallback((targetId: string, signal: unknown) => {
    send('signal:offer', { targetId, signal });
  }, [send]);

  const sendAnswer = useCallback((targetId: string, signal: unknown) => {
    send('signal:answer', { targetId, signal });
  }, [send]);

  const sendIceCandidate = useCallback((targetId: string, signal: unknown) => {
    send('signal:ice', { targetId, signal });
  }, [send]);

  return {
    send,
    connect,
    disconnect,
    setReady,
    setSide,
    setLanguages,
    startDebate,
    endSpeech,
    startNextSpeech,
    pauseTimer,
    resumeTimer,
    startPrep,
    endPrep,
    sendSignal,
    sendAnswer,
    sendIceCandidate,
  };
}
