import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { v4 as uuid } from 'uuid';
import type { WSMessage } from '@shared/types';
import { handleMessage } from './handlers.js';

// Extended WebSocket with custom properties
export interface ExtendedWebSocket extends WebSocket {
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
    console.log('WebSocket server initialized');
  }

  private setupHeartbeat(): void {
    // Ping all clients every 30 seconds to detect dead connections
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const client = ws as ExtendedWebSocket;
        if (!client.isAlive) {
          console.log(`Client ${client.id} timed out`);
          return client.terminate();
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

      this.clients.set(client.id, client);
      console.log(`Client connected: ${client.id}`);

      // Send client their ID
      this.send(client.id, {
        type: 'room:state',
        payload: { clientId: client.id },
      });

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
    if (client.roomId) {
      // Notify other participants in the room
      this.broadcastToRoom(
        client.roomId,
        {
          type: 'participant:left',
          payload: { participantId: client.id },
        },
        client.id
      );
    }
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
