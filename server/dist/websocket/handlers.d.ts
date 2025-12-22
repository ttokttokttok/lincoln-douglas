import type { WSMessage } from '@shared/types';
import type { ExtendedWebSocket, SignalingServer } from './server.js';
export declare function initializeDebateCallbacks(server: SignalingServer): void;
export declare function handleMessage(client: ExtendedWebSocket, message: WSMessage, server: SignalingServer): void;
//# sourceMappingURL=handlers.d.ts.map