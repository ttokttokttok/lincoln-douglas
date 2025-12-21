import type {
  WSMessage,
  RoomCreatePayload,
  RoomJoinPayload,
  ParticipantUpdatePayload,
  SignalPayload,
} from '@shared/types';
import { roomManager } from '../rooms/manager.js';
import type { ExtendedWebSocket, SignalingServer } from './server.js';

export function handleMessage(
  client: ExtendedWebSocket,
  message: WSMessage,
  server: SignalingServer
): void {
  console.log(`Message from ${client.id}:`, message.type);

  switch (message.type) {
    case 'room:create':
      handleRoomCreate(client, message.payload as RoomCreatePayload, server);
      break;

    case 'room:join':
      handleRoomJoin(client, message.payload as RoomJoinPayload, server);
      break;

    case 'room:leave':
      handleRoomLeave(client, server);
      break;

    case 'room:ready':
      handleRoomReady(client, message.payload as { isReady: boolean }, server);
      break;

    case 'participant:update':
      handleParticipantUpdate(client, message.payload as ParticipantUpdatePayload, server);
      break;

    case 'signal:offer':
    case 'signal:answer':
    case 'signal:ice':
      handleSignaling(client, message, server);
      break;

    default:
      console.warn(`Unknown message type: ${message.type}`);
      server.sendError(client.id, `Unknown message type: ${message.type}`);
  }
}

function handleRoomCreate(
  client: ExtendedWebSocket,
  payload: RoomCreatePayload,
  server: SignalingServer
): void {
  const { resolution, displayName } = payload;

  if (!resolution || !displayName) {
    server.sendError(client.id, 'Resolution and display name are required');
    return;
  }

  // Create the room
  const room = roomManager.createRoom(client.id, displayName, resolution);

  // Associate client with room
  server.setClientRoom(client.id, room.id);

  // Send room state to creator (include their ID)
  server.send(client.id, {
    type: 'room:state',
    payload: {
      room: roomManager.serializeRoom(room),
      yourParticipantId: client.id,
    },
  });

  console.log(`Room created: ${room.code} by ${displayName}`);
}

function handleRoomJoin(
  client: ExtendedWebSocket,
  payload: RoomJoinPayload,
  server: SignalingServer
): void {
  const { code, displayName } = payload;

  if (!code || !displayName) {
    server.sendError(client.id, 'Room code and display name are required');
    return;
  }

  // Find room by code
  const room = roomManager.getRoomByCode(code.toUpperCase());

  if (!room) {
    server.sendError(client.id, 'Room not found', 'ROOM_NOT_FOUND');
    return;
  }

  // Try to add participant
  const result = roomManager.addParticipant(room.id, client.id, displayName);

  if (!result.success) {
    server.sendError(client.id, result.error || 'Failed to join room');
    return;
  }

  // Associate client with room
  server.setClientRoom(client.id, room.id);

  // Send room state to new participant (include their ID)
  const updatedRoom = roomManager.getRoom(room.id)!;
  server.send(client.id, {
    type: 'room:state',
    payload: {
      room: roomManager.serializeRoom(updatedRoom),
      yourParticipantId: client.id,
    },
  });

  // Notify other participants
  server.broadcastToRoom(
    room.id,
    {
      type: 'participant:joined',
      payload: {
        participant: updatedRoom.participants.get(client.id),
      },
    },
    client.id
  );

  // Also send updated room state to all participants
  server.broadcastToRoomAll(room.id, {
    type: 'room:state',
    payload: { room: roomManager.serializeRoom(updatedRoom) },
  });

  console.log(`${displayName} joined room ${room.code}`);
}

function handleRoomLeave(client: ExtendedWebSocket, server: SignalingServer): void {
  if (!client.roomId) return;

  const roomId = client.roomId;

  // Remove participant from room
  roomManager.removeParticipant(roomId, client.id);

  // Notify other participants
  server.broadcastToRoom(roomId, {
    type: 'participant:left',
    payload: { participantId: client.id },
  });

  // Update room state for remaining participants
  const room = roomManager.getRoom(roomId);
  if (room) {
    server.broadcastToRoom(roomId, {
      type: 'room:state',
      payload: { room: roomManager.serializeRoom(room) },
    });
  }

  // Clear client's room association
  client.roomId = undefined;
}

function handleRoomReady(
  client: ExtendedWebSocket,
  payload: { isReady: boolean },
  server: SignalingServer
): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  roomManager.setParticipantReady(client.roomId, client.id, payload.isReady);

  // Broadcast updated room state
  const room = roomManager.getRoom(client.roomId);
  if (room) {
    server.broadcastToRoomAll(client.roomId, {
      type: 'room:state',
      payload: { room: roomManager.serializeRoom(room) },
    });
  }
}

function handleParticipantUpdate(
  client: ExtendedWebSocket,
  payload: Partial<ParticipantUpdatePayload> & Record<string, unknown>,
  server: SignalingServer
): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  // Payload can be either { updates: {...} } or direct updates like { side: 'AFF' }
  const updates = payload.updates || payload;

  // Apply updates
  roomManager.updateParticipant(client.roomId, client.id, updates as Record<string, unknown>);

  // Broadcast updated room state
  const room = roomManager.getRoom(client.roomId);
  if (room) {
    server.broadcastToRoomAll(client.roomId, {
      type: 'room:state',
      payload: { room: roomManager.serializeRoom(room) },
    });
  }
}

function handleSignaling(
  client: ExtendedWebSocket,
  message: WSMessage,
  server: SignalingServer
): void {
  const payload = message.payload as SignalPayload;

  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  if (!payload.targetId) {
    // Broadcast to all other participants in the room
    server.broadcastToRoom(
      client.roomId,
      {
        type: message.type,
        payload: {
          senderId: client.id,
          signal: payload.signal,
        },
      },
      client.id
    );
  } else {
    // Send to specific target
    server.send(payload.targetId, {
      type: message.type,
      payload: {
        senderId: client.id,
        signal: payload.signal,
      },
    });
  }
}
