import { WebSocket } from 'ws';
import { Server } from 'http';
import type { WSMessage } from '@shared/types';
export interface ExtendedWebSocket extends WebSocket {
    id: string;
    roomId?: string;
    isAlive: boolean;
}
declare class SignalingServer {
    private wss;
    private clients;
    constructor(server: Server);
    private setupHeartbeat;
    private setupConnectionHandler;
    private handleDisconnect;
    send(clientId: string, message: WSMessage): boolean;
    sendError(clientId: string, errorMessage: string, code?: string): void;
    broadcastToRoom(roomId: string, message: WSMessage, excludeId?: string): void;
    broadcastToRoomAll(roomId: string, message: WSMessage): void;
    getClient(clientId: string): ExtendedWebSocket | undefined;
    setClientRoom(clientId: string, roomId: string): void;
    getClientsInRoom(roomId: string): string[];
}
export declare function setupWebSocketServer(server: Server): SignalingServer;
export declare function getSignalingServer(): SignalingServer | null;
export { SignalingServer };
//# sourceMappingURL=server.d.ts.map