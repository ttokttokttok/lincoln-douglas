import type { SpeechRole } from './types.js';
interface IceServer {
    urls: string | string[];
    username?: string;
    credential?: string;
}
export declare const ICE_SERVERS: IceServer[];
export declare const SPEECH_TIMES: Record<SpeechRole, number>;
export declare const MICRO_SPEECH_TIMES: Record<SpeechRole, number>;
export declare const PREP_TIME = 120;
export declare const SPEECH_ORDER: SpeechRole[];
export declare const SPEECH_SIDES: Record<SpeechRole, 'AFF' | 'NEG'>;
export declare const WS_RECONNECT_INTERVAL = 1000;
export declare const WS_MAX_RECONNECT_ATTEMPTS = 5;
export declare const MAX_ROOM_PARTICIPANTS = 2;
export declare const ROOM_CODE_LENGTH = 6;
export {};
//# sourceMappingURL=constants.d.ts.map