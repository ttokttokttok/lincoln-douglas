import type {
  WSMessage,
  RoomCreatePayload,
  RoomJoinPayload,
  RoomRejoinPayload,
  SignalPayload,
  Side,
  SpeechRole,
  TimerState,
  AudioStartPayload,
  AudioChunkPayload,
  AudioStopPayload,
  LanguageCode,
  VoiceSelectPayload,
  VoiceListRequestPayload,
  TimeoutReason,
  EmotionMarkers,
  BotRoomCreatePayload,
  BotSpeechSkipPayload,
} from '@shared/types';
import { SPEECH_ORDER, SPEECH_SIDES, BOT_CHARACTERS } from '@shared/types';
import {
  createBotParticipantState,
  registerBot,
  getBotState,
  unregisterBot,
} from '../bot/botParticipant.js';
import { botManager } from '../bot/botManager.js';
import { roomManager } from '../rooms/manager.js';
import { sessionManager } from '../rooms/sessionManager.js';
import { debateManager } from '../timer/debateController.js';
import { audioSessionManager } from '../audio/sessionManager.js';
import { geminiSttService } from '../stt/geminiStt.js';
import { translationService } from '../translation/geminiTranslation.js';
import { flowStateManager } from '../flow/flowStateManager.js';
import { argumentExtractor } from '../flow/argumentExtractor.js';
import { ballotGenerator } from '../flow/ballotGenerator.js';
import { elevenLabsTTS } from '../tts/elevenLabsTts.js';
import { ttsSessionManager } from '../tts/sessionManager.js';
import { emotionDetector } from '../emotion/emotionDetector.js';
import type { ExtendedWebSocket, SignalingServer } from './server.js';

// Store server reference for callbacks
let serverRef: SignalingServer | null = null;

// Initialize debate callbacks and STT callbacks
export function initializeDebateCallbacks(server: SignalingServer): void {
  serverRef = server;

  // Initialize bot manager with callbacks (Milestone 5)
  botManager.initialize({
    broadcastToRoom: (roomId: string, message: unknown) => {
      server.broadcastToRoomAll(roomId, message as WSMessage);
    },
    onSpeechStart: (roomId: string, speech: SpeechRole, botId: string) => {
      const room = roomManager.getRoom(roomId);
      if (room) {
        room.currentSpeech = speech;
        room.currentSpeaker = botId;
        server.broadcastToRoomAll(roomId, {
          type: 'speech:start',
          payload: { speech, speakerId: botId },
        });
        server.broadcastToRoomAll(roomId, {
          type: 'room:state',
          payload: { room: roomManager.serializeRoom(room) },
        });
      }
    },
    onSpeechEnd: (roomId: string, speech: SpeechRole) => {
      // This is handled by debateManager's onSpeechEnd callback
    },
    onTTSReady: (roomId: string) => {
      // Start the bot's speech timer when TTS is ready to play
      debateManager.startBotSpeechTimer(roomId);
    },
  });

  // Set up STT transcription callback
  geminiSttService.setTranscriptionCallback(async (participantId, result) => {
    // Find the room for this participant
    const roomId = server.getClientRoomId(participantId);
    if (!roomId) return;

    const room = roomManager.getRoom(roomId);
    const participant = room?.participants.get(participantId);
    if (!room || !participant) return;

    // Get current speech (default to AC if not set)
    const currentSpeech = (room.currentSpeech ?? 'AC') as SpeechRole;

    // Capture speech version at start of this transcription processing
    // Used to check if speech is still current before queueing TTS
    const speechVersion = flowStateManager.getSpeechVersion(roomId);

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
      const targetLanguages = [...new Set(
        otherParticipants
          .map(p => p.listeningLanguage)
          .filter(lang => lang !== result.language)
      )] as LanguageCode[];

      // Translate to each unique target language
      for (const targetLanguage of targetLanguages) {
        try {
          const translationResult = await translationService.translate(
            result.text,
            result.language,
            targetLanguage,
            {
              resolution: room.resolution,
              currentSpeech,
              speakerSide: participant.side || 'AFF',
              speakerName: participant.displayName,
            }
          );

          if (translationResult) {
            // Detect emotion from the text (Milestone 4)
            let detectedEmotion: EmotionMarkers | undefined;
            if (emotionDetector.isReady()) {
              try {
                const emotionResult = await emotionDetector.detectEmotion(
                  result.text,
                  translationResult.translatedText,
                  result.language,
                  targetLanguage,
                  {
                    resolution: room.resolution,
                    speechRole: currentSpeech,
                    speakerSide: participant.side || 'AFF',
                    speakerName: participant.displayName,
                  }
                );
                detectedEmotion = emotionResult.emotion;
              } catch (emotionError) {
                console.error('[Emotion] Error detecting emotion:', emotionError);
                // Continue without emotion - TTS will use neutral settings
              }
            }

            // Broadcast translation to all participants (include emotion if detected)
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
                emotion: detectedEmotion,
              },
            });

            // Generate TTS for listeners who need this translation spoken
            // IMPORTANT: Check speech version to skip stale translations from previous speech
            if (elevenLabsTTS.isReady() && flowStateManager.isSpeechVersionCurrent(roomId, speechVersion)) {
              generateTTSForListeners(
                roomId,
                participantId,
                currentSpeech,
                translationResult.translatedText,
                targetLanguage,
                detectedEmotion,  // Pass emotion hints to TTS
                server
              );
            } else if (!flowStateManager.isSpeechVersionCurrent(roomId, speechVersion)) {
              console.log(`[TTS] Skipping stale translation (speech ended before TTS could queue)`);
            }
          }
        } catch (error) {
          console.error('[Translation] Error translating:', error);
        }
      }
    }
  });

  debateManager.setCallbacks({
    onTimerUpdate: (roomId: string, timer: TimerState) => {
      server.broadcastToRoomAll(roomId, {
        type: 'timer:update',
        payload: { timer },
      });
    },
    onSpeechStart: (roomId: string, speech: SpeechRole, speakerId: string) => {
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
    onSpeechEnd: async (roomId: string, speech: SpeechRole, nextSpeech: SpeechRole | null) => {
      const room = roomManager.getRoom(roomId);

      // CRITICAL: Increment speech version to invalidate any in-flight translations
      // This prevents stale translations from queueing TTS after speech ends
      flowStateManager.incrementSpeechVersion(roomId);

      // Clear any pending TTS from the speaker who just finished
      // This prevents accumulated TTS from playing during the next speaker's turn
      if (room?.currentSpeaker) {
        ttsSessionManager.clearQueue(room.currentSpeaker);
        console.log(`[TTS] Cleared queue for ${room.currentSpeaker} on speech end`);
      }

      // Milestone 5: Force stop bot speech when timer ends
      if (room?.mode === 'practice') {
        const speaker = room.participants.get(room.currentSpeaker || '');
        if (speaker?.isBot) {
          console.log(`[Bot] Timer ended - stopping bot speech for ${speech}`);
          botManager.stopBotSpeech(roomId);
        }
      }

      server.broadcastToRoomAll(roomId, {
        type: 'speech:end',
        payload: { speech, nextSpeech },
      });

      // Extract arguments from the completed speech
      // Register as pending extraction so onDebateEnd can await it
      if (argumentExtractor.isReady()) {
        const currentRoom = roomManager.getRoom(roomId);
        if (currentRoom) {
          const extractionPromise = (async () => {
            const transcript = flowStateManager.getSpeechTranscript(roomId, speech);
            const priorArguments = flowStateManager.getArguments(roomId);

            const extractedArgs = await argumentExtractor.extractArguments(transcript, {
              resolution: currentRoom.resolution,
              speech,
              priorArguments,
            });

            if (extractedArgs.length > 0) {
              flowStateManager.addArguments(roomId, extractedArgs);
              console.log(`[Flow] Extracted ${extractedArgs.length} arguments from ${speech}`);
            }
          })();

          // Register this extraction so ballot generation can wait for it
          flowStateManager.registerPendingExtraction(roomId, extractionPromise);

          // Still await it here for proper flow
          await extractionPromise;
        }
      }

      // Milestone 5: Practice mode - Auto-trigger bot's next speech
      if (room && room.mode === 'practice' && nextSpeech) {
        const nextSpeakerSide = SPEECH_SIDES[nextSpeech];
        const nextSpeaker = Array.from(room.participants.values()).find(p => p.side === nextSpeakerSide);

        if (nextSpeaker?.isBot) {
          console.log(`[Bot] Auto-triggering bot speech for ${nextSpeech}`);
          // Small delay to allow UI to update before starting next speech
          setTimeout(() => {
            debateManager.startNextSpeech(roomId);
          }, 1000);
        }
      }
    },
    onDebateStart: (roomId: string) => {
      const room = roomManager.getRoom(roomId);
      if (room) {
        server.broadcastToRoomAll(roomId, {
          type: 'room:state',
          payload: { room: roomManager.serializeRoom(room) },
        });
      }
      console.log(`Debate started in room ${roomId}`);
    },
    onDebateEnd: async (roomId: string) => {
      const room = roomManager.getRoom(roomId);

      // CRITICAL: Snapshot room data BEFORE any async operations
      // This prevents issues if the room is deleted during cleanup
      const roomSnapshot = room ? {
        resolution: room.resolution,
        participants: Array.from(room.participants.values()).map(p => ({
          id: p.id,
          displayName: p.displayName,
          side: p.side,
        })),
      } : null;

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

      // Generate ballot and flow state using the snapshot
      if (ballotGenerator.isReady() && roomSnapshot) {
        // Wait for all pending argument extractions to complete
        // This properly handles the async onSpeechEnd callback chain
        await flowStateManager.waitForPendingExtractions(roomId);

        // Fallback: Ensure 2AR arguments are extracted if still missing
        const existing2ARArgs = flowStateManager.getArgumentsBySpeech(roomId, '2AR');
        if (existing2ARArgs.length === 0 && argumentExtractor.isReady()) {
          const transcript = flowStateManager.getSpeechTranscript(roomId, '2AR');
          if (transcript && transcript.length > 50) {
            console.log('[Flow] Ensuring 2AR extraction before ballot (fallback)...');
            const priorArguments = flowStateManager.getArguments(roomId);
            const extractedArgs = await argumentExtractor.extractArguments(transcript, {
              resolution: roomSnapshot.resolution,
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
        const affParticipant = roomSnapshot.participants.find(p => p.side === 'AFF');
        const negParticipant = roomSnapshot.participants.find(p => p.side === 'NEG');

        const ballot = await ballotGenerator.generateBallot({
          resolution: roomSnapshot.resolution,
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
    // Timeout callbacks
    onTimeoutWarning: (roomId: string, reason: TimeoutReason, secondsRemaining: number) => {
      const message = reason === 'inactivity'
        ? `No activity detected. Debate will end in ${Math.floor(secondsRemaining / 60)} minutes to save resources.`
        : `Maximum debate duration approaching. Debate will end in ${Math.floor(secondsRemaining / 60)} minutes.`;

      server.broadcastToRoomAll(roomId, {
        type: 'debate:timeout_warning',
        payload: {
          reason,
          secondsRemaining,
          message,
        },
      });
      console.log(`[Timeout] Warning sent to room ${roomId}: ${reason}`);
    },
    onTimeoutEnd: (roomId: string, reason: TimeoutReason) => {
      const message = reason === 'inactivity'
        ? 'Debate ended due to inactivity (10 minutes with no audio).'
        : 'Debate ended - maximum duration (90 minutes) reached.';

      server.broadcastToRoomAll(roomId, {
        type: 'debate:timeout_end',
        payload: {
          reason,
          message,
        },
      });
      console.log(`[Timeout] Debate ended in room ${roomId}: ${reason}`);
    },
    // Bot speech callbacks (Milestone 5)
    onBotPrepStart: (roomId: string, speech: SpeechRole, botId: string) => {
      // Notify clients that bot is preparing (listening phase ended)
      const room = roomManager.getRoom(roomId);
      if (room) {
        room.currentSpeech = speech;
        room.currentSpeaker = botId;
        server.broadcastToRoomAll(roomId, {
          type: 'bot:prep:start',
          payload: {
            speech,
            botId,
          },
        });
        // Also send updated room state
        server.broadcastToRoomAll(roomId, {
          type: 'room:state',
          payload: { room: roomManager.serializeRoom(room) },
        });
      }
      console.log(`[Bot] Prep phase started for ${speech}`);
    },
    onBotPrepEnd: (roomId: string, speech: SpeechRole) => {
      // Notify clients that bot prep is done, speech timer starting
      server.broadcastToRoomAll(roomId, {
        type: 'bot:prep:end',
        payload: {
          speech,
        },
      });
      console.log(`[Bot] Prep phase ended for ${speech}, timer starting`);
    },
    onBotSpeechChunk: (roomId: string, chunk: Buffer, index: number) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const botId = roomManager.getBotParticipantId(roomId);
      if (!botId) return;

      // Broadcast TTS audio chunk to all participants
      server.broadcastToRoomAll(roomId, {
        type: 'tts:audio_chunk',
        payload: {
          speakerId: botId,
          speechId: room.currentSpeech || 'bot',
          chunkIndex: index,
          audioData: chunk.toString('base64'),
          isFinal: false,
          timestamp: Date.now(),
        },
      });
    },
    onBotSpeechComplete: (roomId: string, speech: SpeechRole) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const botId = roomManager.getBotParticipantId(roomId);
      if (!botId) return;

      // Notify clients that bot TTS is complete
      server.broadcastToRoomAll(roomId, {
        type: 'tts:end',
        payload: {
          speakerId: botId,
          speechId: speech,
        },
      });
      console.log(`[Bot] TTS complete for ${speech}`);
    },
  });
}

export function handleMessage(
  client: ExtendedWebSocket,
  message: WSMessage,
  server: SignalingServer
): void {
  // Don't log high-frequency audio chunks (logged separately in sessionManager)
  if (message.type !== 'audio:chunk') {
    console.log(`Message from ${client.id}:`, message.type);
  }

  switch (message.type) {
    case 'room:create':
      handleRoomCreate(client, message.payload as RoomCreatePayload, server);
      break;

    case 'room:join':
      handleRoomJoin(client, message.payload as RoomJoinPayload, server);
      break;

    case 'room:rejoin':
      handleRoomRejoin(client, message.payload as RoomRejoinPayload, server);
      break;

    case 'room:leave':
      handleRoomLeave(client, server);
      break;

    case 'room:ready':
      handleRoomReady(client, message.payload as { isReady: boolean }, server);
      break;

    case 'room:start':
      handleRoomStart(client, server);
      break;

    case 'participant:update':
      handleParticipantUpdate(client, message.payload as Record<string, unknown>, server);
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
      handlePrepStart(client, message.payload as { side: Side }, server);
      break;

    case 'prep:end':
      handlePrepEnd(client, server);
      break;

    // Audio streaming messages (Milestone 2)
    case 'audio:start':
      handleAudioStart(client, message.payload as AudioStartPayload, server);
      break;

    case 'audio:chunk':
      handleAudioChunk(client, message.payload as AudioChunkPayload, server);
      break;

    case 'audio:stop':
      handleAudioStop(client, message.payload as AudioStopPayload, server);
      break;

    // TTS/Voice messages (Milestone 3)
    case 'voice:list:request':
      handleVoiceListRequest(client, message.payload as VoiceListRequestPayload, server);
      break;

    case 'voice:select':
      handleVoiceSelect(client, message.payload as VoiceSelectPayload, server);
      break;

    // Bot practice mode handlers (Milestone 5)
    case 'bot:room:create':
      handleBotRoomCreate(client, message.payload as BotRoomCreatePayload, server);
      break;

    case 'bot:speech:skip':
      handleBotSpeechSkip(client, message.payload as BotSpeechSkipPayload, server);
      break;

    // Keepalive ping from client
    case 'ping':
      // Mark client as alive and respond with pong
      client.isAlive = true;
      client.missedPings = 0;
      server.send(client.id, { type: 'pong', payload: {} });
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

  // Create session for the participant
  const sessionToken = sessionManager.createSession(
    client.id,
    room.id,
    client.id,
    displayName
  );

  // Associate client with room
  server.setClientRoom(client.id, room.id);

  // Send room state to creator (include their ID and session token)
  server.send(client.id, {
    type: 'room:state',
    payload: {
      room: roomManager.serializeRoom(room),
      yourParticipantId: client.id,
      sessionToken,
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

  // Create session for the participant
  const sessionToken = sessionManager.createSession(
    client.id,
    room.id,
    client.id,
    displayName
  );

  // Associate client with room
  server.setClientRoom(client.id, room.id);

  // Send room state to new participant (include their ID and session token)
  const updatedRoom = roomManager.getRoom(room.id)!;
  server.send(client.id, {
    type: 'room:state',
    payload: {
      room: roomManager.serializeRoom(updatedRoom),
      yourParticipantId: client.id,
      sessionToken,
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

/**
 * Handle reconnection with session token
 * This allows users to rejoin after a refresh without losing their spot
 */
function handleRoomRejoin(
  client: ExtendedWebSocket,
  payload: RoomRejoinPayload,
  server: SignalingServer
): void {
  const { sessionToken, displayName } = payload;

  if (!sessionToken || !displayName) {
    server.sendError(client.id, 'Session token and display name are required', 'REJOIN_FAILED');
    return;
  }

  // Attempt to rejoin using session token
  const session = sessionManager.attemptRejoin(sessionToken, client.id, displayName);

  if (!session) {
    // Session not found or expired - client should do a fresh join
    server.sendError(client.id, 'Session expired or invalid', 'SESSION_EXPIRED');
    return;
  }

  // Get the room
  const room = roomManager.getRoom(session.roomId);
  if (!room) {
    // Room was deleted - clean up session
    sessionManager.removeSession(sessionToken);
    server.sendError(client.id, 'Room no longer exists', 'ROOM_NOT_FOUND');
    return;
  }

  // Mark participant as reconnected
  roomManager.markParticipantReconnected(session.roomId, session.participantId);

  // Associate new client with room
  server.setClientRoom(client.id, session.roomId);

  // Send room state to rejoining participant (include their original participant ID)
  server.send(client.id, {
    type: 'room:state',
    payload: {
      room: roomManager.serializeRoom(room),
      yourParticipantId: session.participantId,
      sessionToken,
    },
  });

  // Notify other participants that this user reconnected
  server.broadcastToRoom(
    session.roomId,
    {
      type: 'participant:joined',
      payload: {
        participant: room.participants.get(session.participantId),
        reconnected: true,
      },
    },
    client.id
  );

  // Also send updated room state to all participants
  server.broadcastToRoomAll(session.roomId, {
    type: 'room:state',
    payload: { room: roomManager.serializeRoom(room) },
  });

  console.log(`${displayName} rejoined room ${room.code} (session recovery)`);
}

function handleRoomLeave(client: ExtendedWebSocket, server: SignalingServer): void {
  if (!client.roomId) return;

  const roomId = client.roomId;

  // Use participant ID (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);

  // Get and remove the session (explicit leave = no reconnect)
  const session = sessionManager.getSessionByClient(client.id);
  if (session) {
    // Cancel any grace period timer and remove session
    sessionManager.removeSession(session.sessionToken);
  }

  // Remove participant from room
  roomManager.removeParticipant(roomId, participantId);

  // Notify other participants
  server.broadcastToRoom(roomId, {
    type: 'participant:left',
    payload: { participantId: participantId },
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

  // Use participant ID (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);
  roomManager.setParticipantReady(client.roomId, participantId, payload.isReady);

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
  payload: Record<string, unknown>,
  server: SignalingServer
): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  // Payload can be either { updates: {...} } or direct updates like { side: 'AFF' }
  const updates = payload.updates || payload;

  // Use participant ID (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);

  // Apply updates
  roomManager.updateParticipant(client.roomId, participantId, updates as Record<string, unknown>);

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

  // Use participant ID for senderId (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);

  if (!payload.targetId) {
    // Broadcast to all other participants in the room
    server.broadcastToRoom(
      client.roomId,
      {
        type: message.type,
        payload: {
          senderId: participantId,
          signal: payload.signal,
        },
      },
      client.id
    );
  } else {
    // Send to specific target - need to find the target's current client ID
    // The targetId might be a participant ID, need to find their client
    const targetSession = sessionManager.getSessionByParticipant(payload.targetId);
    const targetClientId = targetSession?.currentClientId || payload.targetId;

    server.send(targetClientId, {
      type: message.type,
      payload: {
        senderId: participantId,
        signal: payload.signal,
      },
    });
  }
}

// Start the debate when both participants are ready
function handleRoomStart(client: ExtendedWebSocket, server: SignalingServer): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  const room = roomManager.getRoom(client.roomId);
  if (!room) {
    server.sendError(client.id, 'Room not found');
    return;
  }

  // Atomically transition room status from 'ready' to 'in_progress'
  // This prevents race conditions when both participants try to start simultaneously
  const transition = roomManager.transitionRoomStatus(client.roomId, 'ready', 'in_progress');
  if (!transition.success) {
    server.sendError(client.id, transition.error || 'Cannot start debate');
    return;
  }

  // Start the debate (room is now atomically in 'in_progress' state)
  const success = debateManager.startDebate(client.roomId);
  if (!success) {
    // Rollback status if debate start fails
    roomManager.setRoomStatus(client.roomId, 'ready');
    server.sendError(client.id, 'Failed to start debate');
  }
}

// Pause the timer
function handleTimerPause(client: ExtendedWebSocket, server: SignalingServer): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  debateManager.pauseTimer(client.roomId);
}

// Resume the timer
function handleTimerResume(client: ExtendedWebSocket, server: SignalingServer): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  debateManager.resumeTimer(client.roomId);
}

// End current speech early
function handleSpeechEnd(client: ExtendedWebSocket, server: SignalingServer): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  // Use participant ID (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);

  // Verify the client is the current speaker
  const debateState = debateManager.getDebateState(client.roomId);
  if (!debateState || debateState.currentSpeaker !== participantId) {
    server.sendError(client.id, 'Only the current speaker can end the speech');
    return;
  }

  debateManager.endSpeech(client.roomId);
}

// Start the next speech (after prep time or transition)
function handleSpeechStart(client: ExtendedWebSocket, server: SignalingServer): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  // Use participant ID (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);

  // Verify the client is on the side that speaks next
  const room = roomManager.getRoom(client.roomId);
  const participant = room?.participants.get(participantId);
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
function handlePrepStart(
  client: ExtendedWebSocket,
  payload: { side: Side },
  server: SignalingServer
): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  // Use participant ID (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);

  // Verify the client is on the side they're trying to use prep for
  const room = roomManager.getRoom(client.roomId);
  const participant = room?.participants.get(participantId);

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
function handlePrepEnd(client: ExtendedWebSocket, server: SignalingServer): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  // Use participant ID (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);

  // Verify the client is on the side whose prep is running
  const timerState = debateManager.getTimerState(client.roomId);
  const room = roomManager.getRoom(client.roomId);
  const participant = room?.participants.get(participantId);

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
function handleAudioStart(
  client: ExtendedWebSocket,
  payload: AudioStartPayload,
  server: SignalingServer
): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  // Use participant ID (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);

  const room = roomManager.getRoom(client.roomId);
  const participant = room?.participants.get(participantId);

  if (!participant) {
    server.sendError(client.id, 'Participant not found');
    return;
  }

  // Start audio session - use participantId for consistency
  const session = audioSessionManager.startSession(
    client.roomId,
    participantId,
    payload.speechId,
    payload.language
  );

  // Start STT session - use participantId
  if (geminiSttService.isReady()) {
    geminiSttService.startSession(participantId, session.sessionId, payload.language);
  }

  console.log(`[Audio] Started streaming from ${participant.displayName} (${payload.language})`);
}

/**
 * Process incoming audio chunk
 */
function handleAudioChunk(
  client: ExtendedWebSocket,
  payload: AudioChunkPayload,
  server: SignalingServer
): void {
  if (!client.roomId) {
    return; // Silently ignore if not in room
  }

  // Check if debate is still in progress (prevent wasting Gemini credits after debate ends)
  const room = roomManager.getRoom(client.roomId);
  if (!room || room.status !== 'in_progress') {
    return; // Debate is over, ignore audio chunks
  }

  // Use participant ID (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);

  // Record activity to reset inactivity timer
  debateManager.recordActivity(client.roomId);

  // Decode base64 audio data
  const audioBuffer = Buffer.from(payload.audioData, 'base64');

  // Process the chunk through session manager - use participantId
  audioSessionManager.processChunk(participantId, audioBuffer);

  // Forward to STT service for transcription - use participantId
  if (geminiSttService.isReady()) {
    geminiSttService.addAudioChunk(participantId, audioBuffer);
  }
}

/**
 * Stop audio streaming
 */
async function handleAudioStop(
  client: ExtendedWebSocket,
  payload: AudioStopPayload,
  server: SignalingServer
): Promise<void> {
  if (!client.roomId) {
    return;
  }

  // Use participant ID (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);

  const session = audioSessionManager.endSession(participantId);

  if (session) {
    const room = roomManager.getRoom(client.roomId);
    const participant = room?.participants.get(participantId);
    console.log(`[Audio] Stopped streaming from ${participant?.displayName || participantId}`);
  }

  // End STT session (will flush any remaining audio) - use participantId
  if (geminiSttService.isReady()) {
    await geminiSttService.endSession(participantId);
  }
}

// ==========================================
// TTS/Voice Handlers (Milestone 3)
// ==========================================

/**
 * Generate TTS audio for listeners who need translation spoken
 * Called after translation completes
 *
 * Milestone 4: Now accepts emotion hints to modulate voice settings
 */
function generateTTSForListeners(
  roomId: string,
  speakerId: string,
  speechId: SpeechRole,
  translatedText: string,
  targetLanguage: LanguageCode,
  emotionHints: EmotionMarkers | undefined,
  server: SignalingServer
): void {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  // Find listeners who need this translation (those whose listeningLanguage matches targetLanguage)
  // IMPORTANT: Exclude the speaker - they shouldn't hear TTS of their own speech
  // We only check speakerId (not currentSpeaker) because the listener SHOULD hear TTS
  // even if it's currently the listener's turn to speak (during transitions, etc.)
  const listeners = Array.from(room.participants.values())
    .filter(p =>
      p.id !== speakerId &&                    // Not the person who spoke this text
      p.listeningLanguage === targetLanguage   // Wants to hear in this language
    );

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
  }, speakerId);  // Exclude speaker from hearing their own TTS

  const emotionLabel = emotionHints ? `${emotionHints.dominantEmotion} (${Math.round(emotionHints.intensity * 100)}%)` : 'neutral';
  console.log(`[TTS] Starting generation for ${speakerId}, ${translatedText.length} chars, emotion: ${emotionLabel}`);

  // Queue TTS generation with emotion hints (Milestone 4)
  ttsSessionManager.queueTTS(
    speakerId,
    roomId,
    speechId,
    {
      text: translatedText,
      voiceId,
      targetLanguage,
      emotionHints,  // Pass emotion to modulate voice settings
    },
    // onChunk: broadcast audio chunk to listeners
    (chunk: Buffer, chunkIndex: number) => {
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
    (error: Error) => {
      server.broadcastToRoom(roomId, {
        type: 'tts:error',
        payload: {
          speakerId,
          speechId,
          error: error.message,
        },
      }, speakerId);
      console.error(`[TTS] Error for ${speakerId}:`, error.message);
    }
  );
}

/**
 * Handle request for available voices for a language
 */
function handleVoiceListRequest(
  client: ExtendedWebSocket,
  payload: VoiceListRequestPayload,
  server: SignalingServer
): void {
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
function handleVoiceSelect(
  client: ExtendedWebSocket,
  payload: VoiceSelectPayload,
  server: SignalingServer
): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  // Use participant ID (may differ from client ID after reconnection)
  const participantId = server.getParticipantId(client.id);

  const { speakingVoiceId } = payload;

  // Validate voice ID exists
  if (!elevenLabsTTS.isValidVoiceId(speakingVoiceId)) {
    server.sendError(client.id, 'Invalid voice ID');
    return;
  }

  // Set voice for this participant - use participantId
  ttsSessionManager.setVoiceForParticipant(participantId, speakingVoiceId);

  // Notify room of voice selection
  server.broadcastToRoomAll(client.roomId, {
    type: 'voice:select',
    payload: {
      participantId: participantId,
      speakingVoiceId,
    },
  });

  const voice = elevenLabsTTS.getVoiceById(speakingVoiceId);
  console.log(`[Voice] ${participantId} selected voice: ${voice?.name || speakingVoiceId}`);
}

// ==========================================
// Bot Practice Mode Handlers (Milestone 5)
// ==========================================

/**
 * Create a bot practice room
 */
function handleBotRoomCreate(
  client: ExtendedWebSocket,
  payload: BotRoomCreatePayload,
  server: SignalingServer
): void {
  const { resolution, displayName, botCharacter, userSide, userLanguage } = payload;

  // Validate required fields
  if (!resolution || !displayName || !botCharacter || !userSide || !userLanguage) {
    server.sendError(client.id, 'Missing required fields for bot room creation');
    return;
  }

  // Validate bot character using shared definitions
  const validCharacters = Object.keys(BOT_CHARACTERS);
  if (!validCharacters.includes(botCharacter)) {
    server.sendError(client.id, 'Invalid bot character');
    return;
  }

  // Validate side
  if (userSide !== 'AFF' && userSide !== 'NEG') {
    server.sendError(client.id, 'Invalid side selection');
    return;
  }

  // Create the bot room
  const room = roomManager.createBotRoom(
    client.id,
    displayName,
    resolution,
    botCharacter,
    userSide,
    userLanguage
  );

  // Register bot participant state
  const botId = roomManager.getBotParticipantId(room.id);
  if (botId) {
    const botSide = userSide === 'AFF' ? 'NEG' : 'AFF';
    const botState = createBotParticipantState(
      room.id,
      botId,
      botCharacter,
      botSide,
      userLanguage
    );
    registerBot(botState);
  }

  // Create session for the participant
  const sessionToken = sessionManager.createSession(
    client.id,
    room.id,
    client.id,
    displayName
  );

  // Associate client with room
  server.setClientRoom(client.id, room.id);

  // Send room state to creator
  server.send(client.id, {
    type: 'room:state',
    payload: {
      room: roomManager.serializeRoom(room),
      yourParticipantId: client.id,
      sessionToken,
    },
  });

  console.log(`[Bot] Practice room created: ${room.code} with ${botCharacter} bot`);
}

/**
 * Skip the current bot speech
 */
function handleBotSpeechSkip(
  client: ExtendedWebSocket,
  payload: BotSpeechSkipPayload,
  server: SignalingServer
): void {
  if (!client.roomId) {
    server.sendError(client.id, 'Not in a room');
    return;
  }

  const room = roomManager.getRoom(client.roomId);
  if (!room || room.mode !== 'practice') {
    server.sendError(client.id, 'Not in a practice room');
    return;
  }

  const botState = getBotState(client.roomId);
  if (!botState) {
    server.sendError(client.id, 'No bot in this room');
    return;
  }

  // Check if bot is currently speaking
  const botId = roomManager.getBotParticipantId(client.roomId);
  if (room.currentSpeaker !== botId) {
    server.sendError(client.id, 'Bot is not currently speaking');
    return;
  }

  // Clear TTS queue for the bot
  if (botId) {
    ttsSessionManager.clearQueue(botId);
    console.log(`[Bot] Speech skipped by user in room ${client.roomId}`);
  }

  // End the bot's current speech early
  debateManager.endSpeech(client.roomId);

  // Notify the client
  server.send(client.id, {
    type: 'speech:end',
    payload: {
      speech: room.currentSpeech,
      skipped: true,
    },
  });
}
