import type { Participant, RoomState, RoomStatus, Side, LanguageCode } from '@shared/types';
interface Room {
    id: string;
    code: string;
    resolution: string;
    status: RoomStatus;
    hostId: string;
    participants: Map<string, Participant>;
    currentSpeaker: string | null;
    currentSpeech: string | null;
    createdAt: number;
}
declare class RoomManager {
    private rooms;
    private codeToRoomId;
    private generateCode;
    createRoom(hostId: string, hostName: string, resolution: string): Room;
    createEmptyRoom(resolution: string): Room;
    getRoom(roomId: string): Room | undefined;
    getRoomByCode(code: string): Room | undefined;
    addParticipant(roomId: string, participantId: string, displayName: string): {
        success: boolean;
        error?: string;
    };
    removeParticipant(roomId: string, participantId: string): void;
    updateParticipant(roomId: string, participantId: string, updates: Partial<Participant>): boolean;
    setParticipantSide(roomId: string, participantId: string, side: Side): boolean;
    setParticipantLanguages(roomId: string, participantId: string, speakingLanguage: LanguageCode, listeningLanguage: LanguageCode): boolean;
    setParticipantReady(roomId: string, participantId: string, isReady: boolean): boolean;
    private checkRoomReady;
    setRoomStatus(roomId: string, status: RoomStatus): boolean;
    serializeRoom(room: Room): RoomState;
    getParticipants(roomId: string): Participant[];
    getParticipantIds(roomId: string): string[];
}
export declare const roomManager: RoomManager;
export {};
//# sourceMappingURL=manager.d.ts.map