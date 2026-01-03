import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { v4 as uuid } from 'uuid';
import type { WSMessage } from '@shared/types';
import { handleMessage, initializeDebateCallbacks } from './handlers.js';
import { roomManager } from '../rooms/manager.js';
import { sessionManager } from '../rooms/sessionManager.js';
import { audioSessionManager } from '../audio/sessionManager.js';
import { geminiSttService } from '../stt/geminiStt.js';
import { ttsSessionManager } from '../tts/sessionManager.js';
import { debateManager } from '../timer/debateController.js';
import { flowStateManager } from '../flow/flowStateManager.js';

// Extended WebSocket with custom properties
export interface ExtendedWebSocket extends WebSocket {
  id: string;
  roomId?: string;
  isAlive: boolean;
  missedPings: number;  // Track consecutive missed pings
}

class SignalingServer {
  private wss: WebSocketServer;
  private clients: Map<string, ExtendedWebSocket> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupHeartbeat();
    this.setupConnectionHandler();
    initializeDebateCallbacks(this);
    console.log('WebSocket server initialized');
  }

  private setupHeartbeat(): void {
    // Ping all clients every 30 seconds to detect dead connections
    // Allow up to 3 missed pings (90 seconds) before terminating
    // This handles background tabs and momentary network hiccups
    const MAX_MISSED_PINGS = 3;

    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const client = ws as ExtendedWebSocket;

        if (!client.isAlive) {
          client.missedPings = (client.missedPings || 0) + 1;

          if (client.missedPings >= MAX_MISSED_PINGS) {
            console.log(`Client ${client.id} timed out after ${client.missedPings} missed pings`);
            return client.terminate();
          }

          console.log(`Client ${client.id} missed ping ${client.missedPings}/${MAX_MISSED_PINGS}`);
        } else {
          client.missedPings = 0;
        }

        client.isAlive = false;
        client.ping();
      });
    }, 30000);
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const client = ws as ExtendedWebSocket;
      client.id = uuid();
      client.isAlive = true;
      client.missedPings = 0;

      this.clients.set(client.id, client);
      console.log(`Client connected: ${client.id}`);

      // Handle pong responses
      client.on('pong', () => {
        client.isAlive = true;
      });

      // Handle incoming messages
      client.on('message', (data) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          handleMessage(client, message, this);
        } catch (error) {
          console.error('Failed to parse message:', error);
          this.sendError(client.id, 'Invalid message format');
        }
      });

      // Handle disconnection
      client.on('close', () => {
        console.log(`Client disconnected: ${client.id}`);
        this.handleDisconnect(client);
        this.clients.delete(client.id);
      });

      // Handle errors
      client.on('error', (error) => {
        console.error(`Client ${client.id} error:`, error);
      });
    });
  }

  private handleDisconnect(client: ExtendedWebSocket): void {
    // Get participant ID (may differ from client ID after reconnection)
    const participantId = this.getParticipantId(client.id);

    // Clean up audio/STT/TTS sessions for this participant
    // This prevents resource leaks and wasted API calls
    const audioSession = audioSessionManager.endSession(participantId);
    if (audioSession) {
      console.log(`[Cleanup] Ended audio session for disconnected participant ${participantId}`);
    }

    // End STT session (async but we don't need to await on disconnect)
    geminiSttService.endSession(participantId).catch(err => {
      console.error(`[Cleanup] Error ending STT session for ${participantId}:`, err);
    });

    // Clear any TTS queue for this participant
    ttsSessionManager.clearQueue(participantId);

    if (client.roomId) {
      const roomId = client.roomId;

      // Use session manager to handle disconnect with grace period
      const result = sessionManager.handleDisconnect(client.id, (session) => {
        // Grace period expired - now actually remove the participant
        this.handleGracePeriodExpired(session.roomId, session.participantId);
      });

      if (result?.startedGracePeriod) {
        // Mark participant as disconnected (but don't remove yet)
        roomManager.markParticipantDisconnected(roomId, result.session.participantId);

        // Notify other participants that this user disconnected (but may reconnect)
        const room = roomManager.getRoom(roomId);
        if (room) {
          this.broadcastToRoom(
            roomId,
            {
              type: 'room:state',
              payload: { room: roomManager.serializeRoom(room) },
            },
            client.id
          );
        }

        console.log(`Client ${client.id} disconnected from room ${roomId} (grace period started)`);
      } else if (!result) {
        // No session found - this was a client that never joined a room properly
        // Just clean up
        console.log(`Client ${client.id} disconnected (no session)`);
      }
    }
  }

  /**
   * Handle grace period expiration - participant didn't reconnect in time
   */
  private handleGracePeriodExpired(roomId: string, participantId: string): void {
    // Now actually remove the participant
    roomManager.removeParticipant(roomId, participantId);

    // Notify remaining participants
    this.broadcastToRoom(roomId, {
      type: 'participant:left',
      payload: { participantId },
    });

    // Check if room still exists (might have been deleted if empty)
    const room = roomManager.getRoom(roomId);
    if (room) {
      // Send updated room state to remaining participants
      this.broadcastToRoom(roomId, {
        type: 'room:state',
        payload: { room: roomManager.serializeRoom(room) },
      });
    } else {
      // Room was deleted (last participant left) - clean up debate state
      debateManager.cleanupRoom(roomId);
      flowStateManager.clearRoom(roomId);
      ttsSessionManager.endRoomSessions(roomId);
      sessionManager.removeRoomSessions(roomId);
      console.log(`[Cleanup] Cleaned up debate resources for deleted room ${roomId}`);
    }

    console.log(`Participant ${participantId} removed after grace period expired`);
  }

  // Send message to a specific client by ID
  send(clientId: string, message: WSMessage): boolean {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  // Send error to a client
  sendError(clientId: string, errorMessage: string, code?: string): void {
    this.send(clientId, {
      type: 'error',
      payload: { message: errorMessage, code },
    });
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

  // Broadcast to all clients in a room including sender
  broadcastToRoomAll(roomId: string, message: WSMessage): void {
    this.clients.forEach((client) => {
      if (client.roomId === roomId) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      }
    });
  }

  // Get client by ID
  getClient(clientId: string): ExtendedWebSocket | undefined {
    return this.clients.get(clientId);
  }

  // Set client's room
  setClientRoom(clientId: string, roomId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.roomId = roomId;
    }
  }

  // Get all client IDs in a room
  getClientsInRoom(roomId: string): string[] {
    const clientIds: string[] = [];
    this.clients.forEach((client) => {
      if (client.roomId === roomId) {
        clientIds.push(client.id);
      }
    });
    return clientIds;
  }

  // Get client's room ID
  getClientRoomId(clientId: string): string | undefined {
    const client = this.clients.get(clientId);
    return client?.roomId;
  }

  /**
   * Get the participant ID for a client.
   * After reconnection, client ID differs from participant ID.
   * This looks up the session to find the original participant ID.
   */
  getParticipantId(clientId: string): string {
    const session = sessionManager.getSessionByClient(clientId);
    if (session) {
      return session.participantId;
    }
    // If no session, client ID is the participant ID (first connection)
    return clientId;
  }
}

let signalingServer: SignalingServer | null = null;

export function setupWebSocketServer(server: Server): SignalingServer {
  signalingServer = new SignalingServer(server);
  return signalingServer;
}

export function getSignalingServer(): SignalingServer | null {
  return signalingServer;
}

export { SignalingServer };
