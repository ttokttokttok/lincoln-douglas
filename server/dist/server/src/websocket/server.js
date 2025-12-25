import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { handleMessage, initializeDebateCallbacks } from './handlers.js';
import { roomManager } from '../rooms/manager.js';
class SignalingServer {
    wss;
    clients = new Map();
    constructor(server) {
        this.wss = new WebSocketServer({ server, path: '/ws' });
        this.setupHeartbeat();
        this.setupConnectionHandler();
        initializeDebateCallbacks(this);
        console.log('WebSocket server initialized');
    }
    setupHeartbeat() {
        // Ping all clients every 30 seconds to detect dead connections
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                const client = ws;
                if (!client.isAlive) {
                    console.log(`Client ${client.id} timed out`);
                    return client.terminate();
                }
                client.isAlive = false;
                client.ping();
            });
        }, 30000);
    }
    setupConnectionHandler() {
        this.wss.on('connection', (ws) => {
            const client = ws;
            client.id = uuid();
            client.isAlive = true;
            this.clients.set(client.id, client);
            console.log(`Client connected: ${client.id}`);
            // Handle pong responses
            client.on('pong', () => {
                client.isAlive = true;
            });
            // Handle incoming messages
            client.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    handleMessage(client, message, this);
                }
                catch (error) {
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
    handleDisconnect(client) {
        if (client.roomId) {
            const roomId = client.roomId;
            // Remove participant from room
            roomManager.removeParticipant(roomId, client.id);
            // Notify other participants
            this.broadcastToRoom(roomId, {
                type: 'participant:left',
                payload: { participantId: client.id },
            }, client.id);
            // Send updated room state to remaining participants
            const room = roomManager.getRoom(roomId);
            if (room) {
                this.broadcastToRoom(roomId, {
                    type: 'room:state',
                    payload: { room: roomManager.serializeRoom(room) },
                });
            }
            console.log(`Client ${client.id} disconnected from room ${roomId}`);
        }
    }
    // Send message to a specific client by ID
    send(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
            return true;
        }
        return false;
    }
    // Send error to a client
    sendError(clientId, errorMessage, code) {
        this.send(clientId, {
            type: 'error',
            payload: { message: errorMessage, code },
        });
    }
    // Broadcast to all clients in a room
    broadcastToRoom(roomId, message, excludeId) {
        this.clients.forEach((client) => {
            if (client.roomId === roomId && client.id !== excludeId) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(message));
                }
            }
        });
    }
    // Broadcast to all clients in a room including sender
    broadcastToRoomAll(roomId, message) {
        this.clients.forEach((client) => {
            if (client.roomId === roomId) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(message));
                }
            }
        });
    }
    // Get client by ID
    getClient(clientId) {
        return this.clients.get(clientId);
    }
    // Set client's room
    setClientRoom(clientId, roomId) {
        const client = this.clients.get(clientId);
        if (client) {
            client.roomId = roomId;
        }
    }
    // Get all client IDs in a room
    getClientsInRoom(roomId) {
        const clientIds = [];
        this.clients.forEach((client) => {
            if (client.roomId === roomId) {
                clientIds.push(client.id);
            }
        });
        return clientIds;
    }
    // Get client's room ID
    getClientRoomId(clientId) {
        const client = this.clients.get(clientId);
        return client?.roomId;
    }
}
let signalingServer = null;
export function setupWebSocketServer(server) {
    signalingServer = new SignalingServer(server);
    return signalingServer;
}
export function getSignalingServer() {
    return signalingServer;
}
export { SignalingServer };
//# sourceMappingURL=server.js.map