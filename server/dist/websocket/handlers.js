import { roomManager } from '../rooms/manager.js';
import { debateManager } from '../timer/debateController.js';
// Store server reference for callbacks
let serverRef = null;
// Initialize debate callbacks
export function initializeDebateCallbacks(server) {
    serverRef = server;
    debateManager.setCallbacks({
        onTimerUpdate: (roomId, timer) => {
            server.broadcastToRoomAll(roomId, {
                type: 'timer:update',
                payload: { timer },
            });
        },
        onSpeechStart: (roomId, speech, speakerId) => {
            // Update room state
            const room = roomManager.getRoom(roomId);
            if (room) {
                room.currentSpeech = speech;
                room.currentSpeaker = speakerId;
            }
            server.broadcastToRoomAll(roomId, {
                type: 'speech:start',
                payload: { speech, speakerId },
            });
            // Also send updated room state
            if (room) {
                server.broadcastToRoomAll(roomId, {
                    type: 'room:state',
                    payload: { room: roomManager.serializeRoom(room) },
                });
            }
        },
        onSpeechEnd: (roomId, speech, nextSpeech) => {
            server.broadcastToRoomAll(roomId, {
                type: 'speech:end',
                payload: { speech, nextSpeech },
            });
        },
        onDebateStart: (roomId) => {
            const room = roomManager.getRoom(roomId);
            if (room) {
                server.broadcastToRoomAll(roomId, {
                    type: 'room:state',
                    payload: { room: roomManager.serializeRoom(room) },
                });
            }
            console.log(`Debate started in room ${roomId}`);
        },
        onDebateEnd: (roomId) => {
            const room = roomManager.getRoom(roomId);
            if (room) {
                room.currentSpeech = null;
                room.currentSpeaker = null;
                server.broadcastToRoomAll(roomId, {
                    type: 'room:state',
                    payload: { room: roomManager.serializeRoom(room) },
                });
            }
            console.log(`Debate ended in room ${roomId}`);
        },
    });
}
export function handleMessage(client, message, server) {
    console.log(`Message from ${client.id}:`, message.type);
    switch (message.type) {
        case 'room:create':
            handleRoomCreate(client, message.payload, server);
            break;
        case 'room:join':
            handleRoomJoin(client, message.payload, server);
            break;
        case 'room:leave':
            handleRoomLeave(client, server);
            break;
        case 'room:ready':
            handleRoomReady(client, message.payload, server);
            break;
        case 'room:start':
            handleRoomStart(client, server);
            break;
        case 'participant:update':
            handleParticipantUpdate(client, message.payload, server);
            break;
        case 'signal:offer':
        case 'signal:answer':
        case 'signal:ice':
            handleSignaling(client, message, server);
            break;
        // Timer/Speech control messages
        case 'timer:pause':
            handleTimerPause(client, server);
            break;
        case 'timer:start':
            handleTimerResume(client, server);
            break;
        case 'speech:end':
            handleSpeechEnd(client, server);
            break;
        case 'speech:start':
            handleSpeechStart(client, server);
            break;
        case 'prep:start':
            handlePrepStart(client, message.payload, server);
            break;
        case 'prep:end':
            handlePrepEnd(client, server);
            break;
        default:
            console.warn(`Unknown message type: ${message.type}`);
            server.sendError(client.id, `Unknown message type: ${message.type}`);
    }
}
function handleRoomCreate(client, payload, server) {
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
function handleRoomJoin(client, payload, server) {
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
    const updatedRoom = roomManager.getRoom(room.id);
    server.send(client.id, {
        type: 'room:state',
        payload: {
            room: roomManager.serializeRoom(updatedRoom),
            yourParticipantId: client.id,
        },
    });
    // Notify other participants
    server.broadcastToRoom(room.id, {
        type: 'participant:joined',
        payload: {
            participant: updatedRoom.participants.get(client.id),
        },
    }, client.id);
    // Also send updated room state to all participants
    server.broadcastToRoomAll(room.id, {
        type: 'room:state',
        payload: { room: roomManager.serializeRoom(updatedRoom) },
    });
    console.log(`${displayName} joined room ${room.code}`);
}
function handleRoomLeave(client, server) {
    if (!client.roomId)
        return;
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
function handleRoomReady(client, payload, server) {
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
function handleParticipantUpdate(client, payload, server) {
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    // Payload can be either { updates: {...} } or direct updates like { side: 'AFF' }
    const updates = payload.updates || payload;
    // Apply updates
    roomManager.updateParticipant(client.roomId, client.id, updates);
    // Broadcast updated room state
    const room = roomManager.getRoom(client.roomId);
    if (room) {
        server.broadcastToRoomAll(client.roomId, {
            type: 'room:state',
            payload: { room: roomManager.serializeRoom(room) },
        });
    }
}
function handleSignaling(client, message, server) {
    const payload = message.payload;
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    if (!payload.targetId) {
        // Broadcast to all other participants in the room
        server.broadcastToRoom(client.roomId, {
            type: message.type,
            payload: {
                senderId: client.id,
                signal: payload.signal,
            },
        }, client.id);
    }
    else {
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
// Start the debate when both participants are ready
function handleRoomStart(client, server) {
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    const room = roomManager.getRoom(client.roomId);
    if (!room) {
        server.sendError(client.id, 'Room not found');
        return;
    }
    // Verify room is ready to start
    if (room.status !== 'ready') {
        server.sendError(client.id, 'Room is not ready to start');
        return;
    }
    // Start the debate
    const success = debateManager.startDebate(client.roomId);
    if (!success) {
        server.sendError(client.id, 'Failed to start debate');
    }
}
// Pause the timer
function handleTimerPause(client, server) {
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    debateManager.pauseTimer(client.roomId);
}
// Resume the timer
function handleTimerResume(client, server) {
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    debateManager.resumeTimer(client.roomId);
}
// End current speech early
function handleSpeechEnd(client, server) {
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    debateManager.endSpeech(client.roomId);
}
// Start the next speech (after prep time or transition)
function handleSpeechStart(client, server) {
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    const success = debateManager.startNextSpeech(client.roomId);
    if (!success) {
        server.sendError(client.id, 'Cannot start next speech');
    }
}
// Start prep time for a side
function handlePrepStart(client, payload, server) {
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    const success = debateManager.startPrep(client.roomId, payload.side);
    if (!success) {
        server.sendError(client.id, 'Cannot start prep time');
    }
}
// End prep time
function handlePrepEnd(client, server) {
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    debateManager.endPrep(client.roomId);
}
//# sourceMappingURL=handlers.js.map