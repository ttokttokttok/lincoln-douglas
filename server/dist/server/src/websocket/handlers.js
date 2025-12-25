import { SPEECH_ORDER, SPEECH_SIDES } from '@shared/types';
import { roomManager } from '../rooms/manager.js';
import { debateManager } from '../timer/debateController.js';
import { audioSessionManager } from '../audio/sessionManager.js';
import { geminiSttService } from '../stt/geminiStt.js';
import { translationService } from '../translation/geminiTranslation.js';
import { flowStateManager } from '../flow/flowStateManager.js';
import { argumentExtractor } from '../flow/argumentExtractor.js';
import { ballotGenerator } from '../flow/ballotGenerator.js';
import { elevenLabsTTS } from '../tts/elevenLabsTts.js';
import { ttsSessionManager } from '../tts/sessionManager.js';
// Store server reference for callbacks
let serverRef = null;
// Initialize debate callbacks and STT callbacks
export function initializeDebateCallbacks(server) {
    serverRef = server;
    // Set up STT transcription callback
    geminiSttService.setTranscriptionCallback(async (participantId, result) => {
        // Find the room for this participant
        const roomId = server.getClientRoomId(participantId);
        if (!roomId)
            return;
        const room = roomManager.getRoom(roomId);
        const participant = room?.participants.get(participantId);
        if (!room || !participant)
            return;
        // Get current speech (default to AC if not set)
        const currentSpeech = (room.currentSpeech ?? 'AC');
        // Broadcast transcript to all participants in the room
        server.broadcastToRoomAll(roomId, {
            type: 'stt:final',
            payload: {
                speakerId: participantId,
                speakerName: participant.displayName,
                speechId: currentSpeech,
                text: result.text,
                language: result.language,
                confidence: result.confidence,
            },
        });
        console.log(`[STT] ${participant.displayName}: "${result.text.substring(0, 50)}${result.text.length > 50 ? '...' : ''}"`);
        // Store transcript in flow state for later argument extraction
        flowStateManager.addTranscript(roomId, currentSpeech, result.text);
        // Translate for listeners who speak different languages
        if (translationService.isReady()) {
            // Find the other participant's language (the listener)
            const otherParticipants = Array.from(room.participants.values())
                .filter(p => p.id !== participantId);
            // Get unique target languages based on what listeners want to hear
            // Use listeningLanguage (what they want to hear) not speakingLanguage
            const targetLanguages = [...new Set(otherParticipants
                    .map(p => p.listeningLanguage)
                    .filter(lang => lang !== result.language))];
            // Translate to each unique target language
            for (const targetLanguage of targetLanguages) {
                try {
                    const translationResult = await translationService.translate(result.text, result.language, targetLanguage, {
                        resolution: room.resolution,
                        currentSpeech,
                        speakerSide: participant.side || 'AFF',
                        speakerName: participant.displayName,
                    });
                    if (translationResult) {
                        // Broadcast translation to all participants
                        server.broadcastToRoomAll(roomId, {
                            type: 'translation:complete',
                            payload: {
                                speakerId: participantId,
                                speakerName: participant.displayName,
                                speechId: currentSpeech,
                                originalText: result.text,
                                originalLanguage: result.language,
                                translatedText: translationResult.translatedText,
                                targetLanguage,
                                latencyMs: translationResult.latencyMs,
                            },
                        });
                        // Generate TTS for listeners who need this translation spoken
                        if (elevenLabsTTS.isReady()) {
                            generateTTSForListeners(roomId, participantId, currentSpeech, translationResult.translatedText, targetLanguage, server);
                        }
                    }
                }
                catch (error) {
                    console.error('[Translation] Error translating:', error);
                }
            }
        }
    });
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
        onSpeechEnd: async (roomId, speech, nextSpeech) => {
            server.broadcastToRoomAll(roomId, {
                type: 'speech:end',
                payload: { speech, nextSpeech },
            });
            // Extract arguments from the completed speech
            if (argumentExtractor.isReady()) {
                const room = roomManager.getRoom(roomId);
                if (room) {
                    const transcript = flowStateManager.getSpeechTranscript(roomId, speech);
                    const priorArguments = flowStateManager.getArguments(roomId);
                    const extractedArgs = await argumentExtractor.extractArguments(transcript, {
                        resolution: room.resolution,
                        speech,
                        priorArguments,
                    });
                    if (extractedArgs.length > 0) {
                        flowStateManager.addArguments(roomId, extractedArgs);
                        console.log(`[Flow] Extracted ${extractedArgs.length} arguments from ${speech}`);
                    }
                }
            }
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
        onDebateEnd: async (roomId) => {
            const room = roomManager.getRoom(roomId);
            if (room) {
                room.currentSpeech = null;
                room.currentSpeaker = null;
                room.status = 'completed';
                server.broadcastToRoomAll(roomId, {
                    type: 'room:state',
                    payload: { room: roomManager.serializeRoom(room) },
                });
            }
            console.log(`Debate ended in room ${roomId}`);
            // IMPORTANT: Clean up all audio/STT sessions to stop Gemini API calls
            // This prevents wasting credits after the debate ends
            const roomSessions = audioSessionManager.getRoomSessions(roomId);
            for (const session of roomSessions) {
                console.log(`[Cleanup] Ending audio session for ${session.participantId}`);
                audioSessionManager.endSession(session.participantId);
                await geminiSttService.endSession(session.participantId);
            }
            console.log(`[Cleanup] Cleaned up ${roomSessions.length} audio session(s) for room ${roomId}`);
            // Clean up TTS sessions
            ttsSessionManager.endRoomSessions(roomId);
            console.log(`[Cleanup] Cleaned up TTS sessions for room ${roomId}`);
            // Generate ballot and flow state
            if (ballotGenerator.isReady() && room) {
                // Wait briefly for any in-flight 2AR extraction from onSpeechEnd callback
                // (The onSpeechEnd is async but not awaited by the timer callback chain)
                await new Promise(resolve => setTimeout(resolve, 500));
                // Ensure 2AR arguments are extracted (in case the async onSpeechEnd hasn't completed)
                const existing2ARArgs = flowStateManager.getArgumentsBySpeech(roomId, '2AR');
                if (existing2ARArgs.length === 0 && argumentExtractor.isReady()) {
                    const transcript = flowStateManager.getSpeechTranscript(roomId, '2AR');
                    if (transcript && transcript.length > 50) {
                        console.log('[Flow] Ensuring 2AR extraction before ballot...');
                        const priorArguments = flowStateManager.getArguments(roomId);
                        const extractedArgs = await argumentExtractor.extractArguments(transcript, {
                            resolution: room.resolution,
                            speech: '2AR',
                            priorArguments,
                        });
                        if (extractedArgs.length > 0) {
                            flowStateManager.addArguments(roomId, extractedArgs);
                            console.log(`[Flow] Extracted ${extractedArgs.length} arguments from 2AR (fallback)`);
                        }
                    }
                }
                const flowState = flowStateManager.getFlowState(roomId);
                const participants = Array.from(room.participants.values());
                const affParticipant = participants.find(p => p.side === 'AFF');
                const negParticipant = participants.find(p => p.side === 'NEG');
                const ballot = await ballotGenerator.generateBallot({
                    resolution: room.resolution,
                    affName: affParticipant?.displayName || 'Affirmative',
                    negName: negParticipant?.displayName || 'Negative',
                    flowState,
                });
                if (ballot) {
                    // Broadcast ballot and flow to all participants
                    server.broadcastToRoomAll(roomId, {
                        type: 'ballot:ready',
                        payload: {
                            ballot,
                            flowState,
                        },
                    });
                    console.log(`[Ballot] Generated for room ${roomId} - Winner: ${ballot.winner}`);
                }
            }
        },
    });
}
export function handleMessage(client, message, server) {
    // Don't log high-frequency audio chunks (logged separately in sessionManager)
    if (message.type !== 'audio:chunk') {
        console.log(`Message from ${client.id}:`, message.type);
    }
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
        // Audio streaming messages (Milestone 2)
        case 'audio:start':
            handleAudioStart(client, message.payload, server);
            break;
        case 'audio:chunk':
            handleAudioChunk(client, message.payload, server);
            break;
        case 'audio:stop':
            handleAudioStop(client, message.payload, server);
            break;
        // TTS/Voice messages (Milestone 3)
        case 'voice:list:request':
            handleVoiceListRequest(client, message.payload, server);
            break;
        case 'voice:select':
            handleVoiceSelect(client, message.payload, server);
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
    // Verify the client is the current speaker
    const debateState = debateManager.getDebateState(client.roomId);
    if (!debateState || debateState.currentSpeaker !== client.id) {
        server.sendError(client.id, 'Only the current speaker can end the speech');
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
    // Verify the client is on the side that speaks next
    const room = roomManager.getRoom(client.roomId);
    const participant = room?.participants.get(client.id);
    const timerState = debateManager.getTimerState(client.roomId);
    if (!participant || !timerState) {
        server.sendError(client.id, 'Cannot start next speech');
        return;
    }
    // Get the next speech and check if this participant's side should speak
    const debateState = debateManager.getDebateState(client.roomId);
    if (debateState) {
        const speechIndex = debateManager.getCurrentSpeechIndex(client.roomId);
        if (speechIndex !== null && speechIndex < SPEECH_ORDER.length) {
            const nextSpeech = SPEECH_ORDER[speechIndex];
            const nextSpeakerSide = SPEECH_SIDES[nextSpeech];
            if (participant.side !== nextSpeakerSide) {
                server.sendError(client.id, 'Only the next speaker can start their speech');
                return;
            }
        }
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
    // Verify the client is on the side they're trying to use prep for
    const room = roomManager.getRoom(client.roomId);
    const participant = room?.participants.get(client.id);
    if (!participant || participant.side !== payload.side) {
        server.sendError(client.id, 'You can only use your own prep time');
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
    // Verify the client is on the side whose prep is running
    const timerState = debateManager.getTimerState(client.roomId);
    const room = roomManager.getRoom(client.roomId);
    const participant = room?.participants.get(client.id);
    if (!timerState?.isPrepTime || !timerState.prepSide) {
        server.sendError(client.id, 'No prep time is running');
        return;
    }
    if (!participant || participant.side !== timerState.prepSide) {
        server.sendError(client.id, 'You can only end your own prep time');
        return;
    }
    debateManager.endPrep(client.roomId);
}
// ==========================================
// Audio Streaming Handlers (Milestone 2)
// ==========================================
/**
 * Start audio streaming for a speech
 */
function handleAudioStart(client, payload, server) {
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    const room = roomManager.getRoom(client.roomId);
    const participant = room?.participants.get(client.id);
    if (!participant) {
        server.sendError(client.id, 'Participant not found');
        return;
    }
    // Start audio session
    const session = audioSessionManager.startSession(client.roomId, client.id, payload.speechId, payload.language);
    // Start STT session
    if (geminiSttService.isReady()) {
        geminiSttService.startSession(client.id, session.sessionId, payload.language);
    }
    console.log(`[Audio] Started streaming from ${participant.displayName} (${payload.language})`);
}
/**
 * Process incoming audio chunk
 */
function handleAudioChunk(client, payload, server) {
    if (!client.roomId) {
        return; // Silently ignore if not in room
    }
    // Check if debate is still in progress (prevent wasting Gemini credits after debate ends)
    const room = roomManager.getRoom(client.roomId);
    if (!room || room.status !== 'in_progress') {
        return; // Debate is over, ignore audio chunks
    }
    // Decode base64 audio data
    const audioBuffer = Buffer.from(payload.audioData, 'base64');
    // Process the chunk through session manager
    audioSessionManager.processChunk(client.id, audioBuffer);
    // Forward to STT service for transcription
    if (geminiSttService.isReady()) {
        geminiSttService.addAudioChunk(client.id, audioBuffer);
    }
}
/**
 * Stop audio streaming
 */
async function handleAudioStop(client, payload, server) {
    if (!client.roomId) {
        return;
    }
    const session = audioSessionManager.endSession(client.id);
    if (session) {
        const room = roomManager.getRoom(client.roomId);
        const participant = room?.participants.get(client.id);
        console.log(`[Audio] Stopped streaming from ${participant?.displayName || client.id}`);
    }
    // End STT session (will flush any remaining audio)
    if (geminiSttService.isReady()) {
        await geminiSttService.endSession(client.id);
    }
}
// ==========================================
// TTS/Voice Handlers (Milestone 3)
// ==========================================
/**
 * Generate TTS audio for listeners who need translation spoken
 * Called after translation completes
 */
function generateTTSForListeners(roomId, speakerId, speechId, translatedText, targetLanguage, server) {
    const room = roomManager.getRoom(roomId);
    if (!room)
        return;
    // Find listeners who need this translation (those whose listeningLanguage matches targetLanguage)
    const listeners = Array.from(room.participants.values())
        .filter(p => p.id !== speakerId && p.listeningLanguage === targetLanguage);
    if (listeners.length === 0) {
        return;
    }
    // Get or assign voice for speaker
    let voiceId = ttsSessionManager.getVoiceForParticipant(speakerId);
    if (!voiceId) {
        // Use default voice for target language
        const defaultVoice = elevenLabsTTS.getDefaultVoice(targetLanguage);
        if (!defaultVoice) {
            console.warn(`[TTS] No voice available for language ${targetLanguage}`);
            return;
        }
        voiceId = defaultVoice.voiceId;
        ttsSessionManager.setVoiceForParticipant(speakerId, voiceId);
    }
    // Notify listeners that TTS is starting
    server.broadcastToRoom(roomId, {
        type: 'tts:start',
        payload: {
            speakerId,
            speechId,
            text: translatedText,
        },
    }, speakerId); // Exclude speaker from hearing their own TTS
    console.log(`[TTS] Starting generation for ${speakerId}, ${translatedText.length} chars`);
    // Queue TTS generation
    ttsSessionManager.queueTTS(speakerId, roomId, speechId, {
        text: translatedText,
        voiceId,
        targetLanguage,
    }, 
    // onChunk: broadcast audio chunk to listeners
    (chunk, chunkIndex) => {
        server.broadcastToRoom(roomId, {
            type: 'tts:audio_chunk',
            payload: {
                speakerId,
                speechId,
                chunkIndex,
                audioData: chunk.toString('base64'),
                isFinal: false,
                timestamp: Date.now(),
            },
        }, speakerId);
    }, 
    // onComplete: notify TTS finished
    () => {
        server.broadcastToRoom(roomId, {
            type: 'tts:end',
            payload: {
                speakerId,
                speechId,
            },
        }, speakerId);
        console.log(`[TTS] Completed generation for ${speakerId}`);
    }, 
    // onError: notify error
    (error) => {
        server.broadcastToRoom(roomId, {
            type: 'tts:error',
            payload: {
                speakerId,
                speechId,
                error: error.message,
            },
        }, speakerId);
        console.error(`[TTS] Error for ${speakerId}:`, error.message);
    });
}
/**
 * Handle request for available voices for a language
 */
function handleVoiceListRequest(client, payload, server) {
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    const voices = elevenLabsTTS.getPresetVoices(payload.language);
    server.send(client.id, {
        type: 'voice:list',
        payload: {
            voices,
            language: payload.language,
        },
    });
    console.log(`[Voice] Sent ${voices.length} voices for ${payload.language} to ${client.id}`);
}
/**
 * Handle voice selection from a participant
 */
function handleVoiceSelect(client, payload, server) {
    if (!client.roomId) {
        server.sendError(client.id, 'Not in a room');
        return;
    }
    const { speakingVoiceId } = payload;
    // Validate voice ID exists
    if (!elevenLabsTTS.isValidVoiceId(speakingVoiceId)) {
        server.sendError(client.id, 'Invalid voice ID');
        return;
    }
    // Set voice for this participant
    ttsSessionManager.setVoiceForParticipant(client.id, speakingVoiceId);
    // Notify room of voice selection
    server.broadcastToRoomAll(client.roomId, {
        type: 'voice:select',
        payload: {
            participantId: client.id,
            speakingVoiceId,
        },
    });
    const voice = elevenLabsTTS.getVoiceById(speakingVoiceId);
    console.log(`[Voice] ${client.id} selected voice: ${voice?.name || speakingVoiceId}`);
}
//# sourceMappingURL=handlers.js.map