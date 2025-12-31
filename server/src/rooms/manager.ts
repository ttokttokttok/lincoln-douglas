import { v4 as uuid } from 'uuid';
import type {
  Participant,
  RoomState,
  RoomStatus,
  Side,
  LanguageCode,
  RoomMode,
  BotCharacter,
} from '@shared/types';
import { BOT_DISPLAY_NAMES } from '@shared/types';

// Internal room representation (uses Map for participants)
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
  // Milestone 5: Bot practice mode
  mode: RoomMode;
  botCharacter?: BotCharacter;
}

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private codeToRoomId: Map<string, string> = new Map();
  // Track rooms with pending operations to prevent race conditions
  private roomLocks: Set<string> = new Set();

  /**
   * Acquire a lock on a room for atomic operations
   * Returns true if lock acquired, false if room is already locked
   */
  private acquireRoomLock(roomId: string): boolean {
    if (this.roomLocks.has(roomId)) {
      return false;
    }
    this.roomLocks.add(roomId);
    return true;
  }

  /**
   * Release a room lock
   */
  private releaseRoomLock(roomId: string): void {
    this.roomLocks.delete(roomId);
  }

  // Generate 6-character room code (no ambiguous characters)
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    // Recursively regenerate if code exists
    return this.codeToRoomId.has(code) ? this.generateCode() : code;
  }

  // Create room with host participant (for WebSocket flow)
  createRoom(hostId: string, hostName: string, resolution: string): Room {
    const id = uuid();
    const code = this.generateCode();

    const host: Participant = {
      id: hostId,
      displayName: hostName,
      side: null,
      speakingLanguage: 'en',
      listeningLanguage: 'en',
      isReady: false,
      isConnected: true,
      isBot: false,
    };

    const room: Room = {
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
  createEmptyRoom(resolution: string): Room {
    const id = uuid();
    const code = this.generateCode();

    const room: Room = {
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
  createBotRoom(
    userId: string,
    userName: string,
    resolution: string,
    botCharacter: BotCharacter,
    userSide: Side,
    userLanguage: LanguageCode
  ): Room {
    const id = uuid();
    const code = this.generateCode();
    const botId = `bot-${uuid()}`;
    const botSide: Side = userSide === 'AFF' ? 'NEG' : 'AFF';

    // Create user participant
    const user: Participant = {
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
    const bot: Participant = {
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

    const room: Room = {
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
  getBotParticipantId(roomId: string): string | null {
    const room = this.rooms.get(roomId);
    if (!room || room.mode !== 'practice') return null;

    for (const [id, participant] of room.participants) {
      if (participant.isBot) {
        return id;
      }
    }
    return null;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByCode(code: string): Room | undefined {
    const roomId = this.codeToRoomId.get(code.toUpperCase());
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  addParticipant(
    roomId: string,
    participantId: string,
    displayName: string
  ): { success: boolean; error?: string; isHost?: boolean } {
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Acquire lock to prevent race conditions during join
    if (!this.acquireRoomLock(roomId)) {
      return { success: false, error: 'Room is busy, please try again' };
    }

    try {
      if (room.participants.size >= 2) {
        return { success: false, error: 'Room is full' };
      }

      if (room.status !== 'waiting') {
        return { success: false, error: 'Debate already in progress' };
      }

      const participant: Participant = {
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

      // First participant becomes the host (atomic - inside lock)
      let isHost = false;
      if (!room.hostId || room.hostId === '') {
        room.hostId = participantId;
        isHost = true;
      }
      console.log(`Participant ${displayName} joined room ${room.code}${isHost ? ' (host)' : ''}`);

      return { success: true, isHost };
    } finally {
      this.releaseRoomLock(roomId);
    }
  }

  removeParticipant(roomId: string, participantId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.participants.delete(participantId);
    console.log(`Participant ${participantId} left room ${room.code}`);

    // Clean up empty rooms
    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
      this.codeToRoomId.delete(room.code);
      console.log(`Room ${room.code} deleted (empty)`);
    }
  }

  updateParticipant(
    roomId: string,
    participantId: string,
    updates: Partial<Participant>
  ): boolean {
    const room = this.rooms.get(roomId);
    const participant = room?.participants.get(participantId);

    if (!participant) return false;

    Object.assign(participant, updates);
    return true;
  }

  setParticipantSide(
    roomId: string,
    participantId: string,
    side: Side
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const participant = room.participants.get(participantId);
    if (!participant) {
      return { success: false, error: 'Participant not found' };
    }

    // Check if side is already taken
    for (const [id, p] of room.participants) {
      if (id !== participantId && p.side === side) {
        const takenBy = p.displayName;
        return {
          success: false,
          error: `${side} side is already taken by ${takenBy}`,
        };
      }
    }

    participant.side = side;
    return { success: true };
  }

  setParticipantLanguages(
    roomId: string,
    participantId: string,
    speakingLanguage: LanguageCode,
    listeningLanguage: LanguageCode
  ): boolean {
    return this.updateParticipant(roomId, participantId, {
      speakingLanguage,
      listeningLanguage,
    });
  }

  setParticipantReady(roomId: string, participantId: string, isReady: boolean): boolean {
    const result = this.updateParticipant(roomId, participantId, { isReady });

    if (result) {
      const room = this.rooms.get(roomId);
      if (room) {
        this.checkRoomReady(room);
      }
    }

    return result;
  }

  private checkRoomReady(room: Room): void {
    if (room.participants.size !== 2) return;

    const participants = Array.from(room.participants.values());
    const allReady = participants.every((p) => p.isReady);
    const sidesAssigned =
      participants.some((p) => p.side === 'AFF') &&
      participants.some((p) => p.side === 'NEG');

    if (allReady && sidesAssigned) {
      room.status = 'ready';
      console.log(`Room ${room.code} is ready to start`);
    }
  }

  setRoomStatus(roomId: string, status: RoomStatus): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    room.status = status;
    return true;
  }

  /**
   * Atomically transition room from one status to another
   * Returns true if transition succeeded, false if room wasn't in expected status
   */
  transitionRoomStatus(
    roomId: string,
    fromStatus: RoomStatus,
    toStatus: RoomStatus
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Acquire lock for atomic transition
    if (!this.acquireRoomLock(roomId)) {
      return { success: false, error: 'Room is busy, please try again' };
    }

    try {
      if (room.status !== fromStatus) {
        return {
          success: false,
          error: `Room is not ${fromStatus} (current: ${room.status})`,
        };
      }

      room.status = toStatus;
      console.log(`Room ${room.code} transitioned: ${fromStatus} -> ${toStatus}`);
      return { success: true };
    } finally {
      this.releaseRoomLock(roomId);
    }
  }

  // Convert internal Room to serializable RoomState
  serializeRoom(room: Room): RoomState {
    return {
      id: room.id,
      code: room.code,
      resolution: room.resolution,
      status: room.status,
      hostId: room.hostId,
      participants: Array.from(room.participants.values()),
      currentSpeaker: room.currentSpeaker,
      currentSpeech: room.currentSpeech as RoomState['currentSpeech'],
      createdAt: room.createdAt,
      mode: room.mode,
      botCharacter: room.botCharacter,
    };
  }

  // Get all participants in a room
  getParticipants(roomId: string): Participant[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.participants.values()) : [];
  }

  // Get participant IDs in a room
  getParticipantIds(roomId: string): string[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.participants.keys()) : [];
  }
}

export const roomManager = new RoomManager();
