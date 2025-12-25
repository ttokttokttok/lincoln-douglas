import { v4 as uuid } from 'uuid';
import { BOT_DISPLAY_NAMES } from '@shared/types';
class RoomManager {
    rooms = new Map();
    codeToRoomId = new Map();
    // Generate 6-character room code (no ambiguous characters)
    generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        // Recursively regenerate if code exists
        return this.codeToRoomId.has(code) ? this.generateCode() : code;
    }
    // Create room with host participant (for WebSocket flow)
    createRoom(hostId, hostName, resolution) {
        const id = uuid();
        const code = this.generateCode();
        const host = {
            id: hostId,
            displayName: hostName,
            side: null,
            speakingLanguage: 'en',
            listeningLanguage: 'en',
            isReady: false,
            isConnected: true,
            isBot: false,
        };
        const room = {
            id,
            code,
            resolution,
            status: 'waiting',
            hostId,
            participants: new Map([[hostId, host]]),
            currentSpeaker: null,
            currentSpeech: null,
            createdAt: Date.now(),
            mode: 'pvp',
        };
        this.rooms.set(id, room);
        this.codeToRoomId.set(code, id);
        console.log(`Room created: ${code} (${id})`);
        return room;
    }
    // Create empty room (for REST API flow - participants join via WebSocket)
    createEmptyRoom(resolution) {
        const id = uuid();
        const code = this.generateCode();
        const room = {
            id,
            code,
            resolution,
            status: 'waiting',
            hostId: '', // Will be set when first participant joins
            participants: new Map(),
            currentSpeaker: null,
            currentSpeech: null,
            createdAt: Date.now(),
            mode: 'pvp',
        };
        this.rooms.set(id, room);
        this.codeToRoomId.set(code, id);
        console.log(`Empty room created: ${code} (${id})`);
        return room;
    }
    // Create a bot practice room (Milestone 5)
    createBotRoom(userId, userName, resolution, botCharacter, userSide, userLanguage) {
        const id = uuid();
        const code = this.generateCode();
        const botId = `bot-${uuid()}`;
        const botSide = userSide === 'AFF' ? 'NEG' : 'AFF';
        // Create user participant
        const user = {
            id: userId,
            displayName: userName,
            side: userSide,
            speakingLanguage: userLanguage,
            listeningLanguage: userLanguage,
            isReady: true,
            isConnected: true,
            isBot: false,
        };
        // Create bot participant
        const bot = {
            id: botId,
            displayName: BOT_DISPLAY_NAMES[botCharacter],
            side: botSide,
            speakingLanguage: userLanguage, // Bot speaks user's language
            listeningLanguage: userLanguage,
            isReady: true,
            isConnected: true,
            isBot: true,
            botCharacter,
        };
        const room = {
            id,
            code,
            resolution,
            status: 'ready', // Bot rooms start ready immediately
            hostId: userId,
            participants: new Map([
                [userId, user],
                [botId, bot],
            ]),
            currentSpeaker: null,
            currentSpeech: null,
            createdAt: Date.now(),
            mode: 'practice',
            botCharacter,
        };
        this.rooms.set(id, room);
        this.codeToRoomId.set(code, id);
        console.log(`Bot room created: ${code} (${id}) with ${BOT_DISPLAY_NAMES[botCharacter]}`);
        return room;
    }
    // Get bot participant ID from a room
    getBotParticipantId(roomId) {
        const room = this.rooms.get(roomId);
        if (!room || room.mode !== 'practice')
            return null;
        for (const [id, participant] of room.participants) {
            if (participant.isBot) {
                return id;
            }
        }
        return null;
    }
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    getRoomByCode(code) {
        const roomId = this.codeToRoomId.get(code.toUpperCase());
        return roomId ? this.rooms.get(roomId) : undefined;
    }
    addParticipant(roomId, participantId, displayName) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return { success: false, error: 'Room not found' };
        }
        if (room.participants.size >= 2) {
            return { success: false, error: 'Room is full' };
        }
        if (room.status !== 'waiting') {
            return { success: false, error: 'Debate already in progress' };
        }
        const participant = {
            id: participantId,
            displayName,
            side: null,
            speakingLanguage: 'en',
            listeningLanguage: 'en',
            isReady: false,
            isConnected: true,
            isBot: false,
        };
        room.participants.set(participantId, participant);
        // First participant becomes the host
        if (!room.hostId || room.hostId === '') {
            room.hostId = participantId;
        }
        console.log(`Participant ${displayName} joined room ${room.code}`);
        return { success: true };
    }
    removeParticipant(roomId, participantId) {
        const room = this.rooms.get(roomId);
        if (!room)
            return;
        room.participants.delete(participantId);
        console.log(`Participant ${participantId} left room ${room.code}`);
        // Clean up empty rooms
        if (room.participants.size === 0) {
            this.rooms.delete(roomId);
            this.codeToRoomId.delete(room.code);
            console.log(`Room ${room.code} deleted (empty)`);
        }
    }
    updateParticipant(roomId, participantId, updates) {
        const room = this.rooms.get(roomId);
        const participant = room?.participants.get(participantId);
        if (!participant)
            return false;
        Object.assign(participant, updates);
        return true;
    }
    setParticipantSide(roomId, participantId, side) {
        const room = this.rooms.get(roomId);
        if (!room)
            return false;
        const participant = room.participants.get(participantId);
        if (!participant)
            return false;
        // Check if side is already taken
        for (const [id, p] of room.participants) {
            if (id !== participantId && p.side === side) {
                return false; // Side already taken
            }
        }
        participant.side = side;
        return true;
    }
    setParticipantLanguages(roomId, participantId, speakingLanguage, listeningLanguage) {
        return this.updateParticipant(roomId, participantId, {
            speakingLanguage,
            listeningLanguage,
        });
    }
    setParticipantReady(roomId, participantId, isReady) {
        const result = this.updateParticipant(roomId, participantId, { isReady });
        if (result) {
            const room = this.rooms.get(roomId);
            if (room) {
                this.checkRoomReady(room);
            }
        }
        return result;
    }
    checkRoomReady(room) {
        if (room.participants.size !== 2)
            return;
        const participants = Array.from(room.participants.values());
        const allReady = participants.every((p) => p.isReady);
        const sidesAssigned = participants.some((p) => p.side === 'AFF') &&
            participants.some((p) => p.side === 'NEG');
        if (allReady && sidesAssigned) {
            room.status = 'ready';
            console.log(`Room ${room.code} is ready to start`);
        }
    }
    setRoomStatus(roomId, status) {
        const room = this.rooms.get(roomId);
        if (!room)
            return false;
        room.status = status;
        return true;
    }
    // Convert internal Room to serializable RoomState
    serializeRoom(room) {
        return {
            id: room.id,
            code: room.code,
            resolution: room.resolution,
            status: room.status,
            hostId: room.hostId,
            participants: Array.from(room.participants.values()),
            currentSpeaker: room.currentSpeaker,
            currentSpeech: room.currentSpeech,
            createdAt: room.createdAt,
            mode: room.mode,
            botCharacter: room.botCharacter,
        };
    }
    // Get all participants in a room
    getParticipants(roomId) {
        const room = this.rooms.get(roomId);
        return room ? Array.from(room.participants.values()) : [];
    }
    // Get participant IDs in a room
    getParticipantIds(roomId) {
        const room = this.rooms.get(roomId);
        return room ? Array.from(room.participants.keys()) : [];
    }
}
export const roomManager = new RoomManager();
//# sourceMappingURL=manager.js.map