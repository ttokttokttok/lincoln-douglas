import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket, type TranscriptMessage, type TranslationMessage, type TTSStartMessage, type TTSChunkMessage, type TTSEndMessage } from '../hooks/useWebSocket';
import { useMediaStream } from '../hooks/useMediaStream';
import { useAudioStream, arrayBufferToBase64 } from '../hooks/useAudioStream';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { usePeer, type SignalData } from '../hooks/usePeer';
import { useRoomStore } from '../stores/roomStore';
import { useTranscriptStore } from '../stores/transcriptStore';
import { VideoPanel, VideoControls } from '../components/VideoPanel';
import { Timer } from '../components/Timer';
import { TranscriptPanel } from '../components/TranscriptPanel';
import { BallotDisplay } from '../components/BallotDisplay';
import { LanguageSelector } from '../components/LanguageSelector';
import { VoiceSelector } from '../components/VoiceSelector';
import { TTSSettings } from '../components/TTSSettings';
import { LANGUAGES, type LanguageCode, type Side, type SpeechRole, type BallotReadyPayload, type TimeoutWarningPayload, type TimeoutEndPayload, type VoiceConfig } from '@shared/types';
import { Bot, Loader, Volume2 } from 'lucide-react';

export function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [displayName] = useState(() => sessionStorage.getItem('displayName') || 'Anonymous');

  // Remote stream state
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Video/audio enabled state
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);

  // Ballot state (shown at end of debate)
  const [ballotData, setBallotData] = useState<BallotReadyPayload | null>(null);

  // Timeout warning state
  const [timeoutWarning, setTimeoutWarning] = useState<TimeoutWarningPayload | null>(null);

  // TTS state (Milestone 3) - controls hearing opponent's translated speech
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [ttsVolume, setTtsVolume] = useState(1.0);

  // Voice selection state
  const [availableVoices, setAvailableVoices] = useState<VoiceConfig[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(false);

  // Bot state (Milestone 5)
  const [isBotPrepping, setIsBotPrepping] = useState(false);  // Bot is preparing (after user's speech ends)
  const [isBotGenerating, setIsBotGenerating] = useState(false);
  // Progressive bot transcript (Milestone 5)
  const [botTranscriptSentences, setBotTranscriptSentences] = useState<string[]>([]);
  const botTranscriptRef = useRef<HTMLDivElement>(null);

  // Track if we're the initiator (first to join with stream ready)
  const isInitiatorRef = useRef(false);
  const hasInitiatedRef = useRef(false);

  // Track if we have an active peer connection (must be before handleSignal)
  const hasPeerRef = useRef(false);

  // Queue for signals that arrive before local stream is ready
  const pendingSignalsRef = useRef<Array<{ senderId: string; signal: unknown }>>([]);

  // Room store state
  const {
    isConnected,
    isConnecting,
    connectionError,
    room,
    myParticipantId,
    botConfig,
  } = useRoomStore();

  // Get local media stream
  const {
    stream: localStream,
    error: mediaError,
    isLoading: isMediaLoading,
    getStream,
    toggleVideo,
    toggleAudio,
  } = useMediaStream({ video: true, audio: true });

  // Handle remote stream
  const handleRemoteStream = useCallback((stream: MediaStream) => {
    console.log('[Room] Remote stream received');
    setRemoteStream(stream);
  }, []);

  // Signal sender ref (will be set after useWebSocket)
  const signalSendersRef = useRef<{
    sendSignal: (targetId: string, signal: unknown) => void;
    sendAnswer: (targetId: string, signal: unknown) => void;
    sendIceCandidate: (targetId: string, signal: unknown) => void;
  } | null>(null);

  // Peer connection
  const {
    isConnected: isPeerConnected,
    isConnecting: isPeerConnecting,
    createPeer,
    signal: signalPeer,
  } = usePeer({
    localStream,
    onRemoteStream: handleRemoteStream,
    onSignal: (data) => {
      // Send signal through WebSocket using correct message type
      const opponent = room?.participants.find(p => p.id !== myParticipantId);
      if (opponent && signalSendersRef.current) {
        if (data.type === 'offer') {
          signalSendersRef.current.sendSignal(opponent.id, data);
        } else if (data.type === 'answer') {
          signalSendersRef.current.sendAnswer(opponent.id, data);
        } else if (data.type === 'candidate') {
          signalSendersRef.current.sendIceCandidate(opponent.id, data);
        }
      }
    },
    onConnect: () => {
      console.log('[Room] Peer connected!');
    },
    onClose: () => {
      console.log('[Room] Peer closed');
      setRemoteStream(null);
    },
    onError: (err) => {
      console.error('[Room] Peer error:', err);
    },
  });

  // Update hasPeerRef whenever peer state changes
  hasPeerRef.current = isPeerConnected || isPeerConnecting;

  // Track if peer creation is in progress to prevent race conditions
  const peerCreationPromiseRef = useRef<Promise<void> | null>(null);

  // Process a single signal (creates peer if needed)
  const processSignal = useCallback(async (signalData: SignalData) => {
    // If we receive an offer and don't have a peer yet, create one as responder
    if (signalData.type === 'offer' && !hasPeerRef.current) {
      // Check if peer creation is already in progress
      if (peerCreationPromiseRef.current) {
        console.log('[Room] Peer creation already in progress, waiting...');
        await peerCreationPromiseRef.current;
      } else {
        console.log('[Room] Creating responder peer for incoming offer');
        hasPeerRef.current = true; // Mark as creating to prevent duplicates

        // Store the promise so concurrent signals can await it
        // Wrap in async void to match Promise<void> type (we don't need the RTCPeerConnection return value)
        const creationPromise = (async () => { await createPeer(false); })();
        peerCreationPromiseRef.current = creationPromise;
        try {
          await creationPromise;
        } finally {
          peerCreationPromiseRef.current = null;
        }
      }
    }

    // Process the signal only after peer is ready
    signalPeer(signalData);
  }, [createPeer, signalPeer]);

  // Handle incoming WebRTC signals
  const handleSignal = useCallback(async (message: { senderId: string; signal: unknown }) => {
    const signalData = message.signal as SignalData;
    console.log('[Room] Signal from:', message.senderId, 'type:', signalData.type, 'hasLocalStream:', !!localStream);

    // If we don't have local stream yet, queue the signal
    if (!localStream) {
      console.log('[Room] Queuing signal - waiting for local stream');
      pendingSignalsRef.current.push(message);
      return;
    }

    // Process the signal
    await processSignal(signalData);
  }, [localStream, processSignal]);

  // Transcript store
  const { addTranscript, addTranslation } = useTranscriptStore();

  // Handle incoming transcripts
  const handleTranscript = useCallback((transcript: TranscriptMessage) => {
    addTranscript({
      speakerId: transcript.speakerId,
      speakerName: transcript.speakerName,
      speechId: transcript.speechId,
      text: transcript.text,
      language: transcript.language,
      confidence: transcript.confidence,
    });
  }, [addTranscript]);

  // Handle incoming translations
  const handleTranslation = useCallback((translation: TranslationMessage) => {
    addTranslation(translation.originalText, translation.speakerId, {
      text: translation.translatedText,
      language: translation.targetLanguage,
      latencyMs: translation.latencyMs,
      emotion: translation.emotion,  // Milestone 4: Store emotion for UI display
    });
  }, [addTranslation]);

  // Handle ballot received (end of debate)
  const handleBallot = useCallback((payload: BallotReadyPayload) => {
    setBallotData(payload);
  }, []);

  // Handle timeout warning
  const handleTimeoutWarning = useCallback((payload: TimeoutWarningPayload) => {
    setTimeoutWarning(payload);
    // Auto-dismiss after 30 seconds
    setTimeout(() => setTimeoutWarning(null), 30000);
  }, []);

  // Handle timeout end
  const handleTimeoutEnd = useCallback((payload: TimeoutEndPayload) => {
    // Show alert and clear warning
    setTimeoutWarning(null);
    alert(payload.message);
  }, []);

  // Handle voice list received
  const handleVoiceList = useCallback((voices: VoiceConfig[], language: LanguageCode) => {
    console.log('[Room] Received', voices.length, 'voices for', language);
    setAvailableVoices(voices);
    setVoicesLoading(false);
    // Auto-select first voice if none selected
    if (!selectedVoiceId && voices.length > 0) {
      setSelectedVoiceId(voices[0].voiceId);
    }
  }, [selectedVoiceId]);

  // Auto-mute raw audio based on language mismatch
  // If opponent speaks a different language than my listening language, mute their raw audio
  const shouldMuteRawAudio = useCallback(() => {
    if (!room || !myParticipantId) return false;
    const myParticipant = room.participants.find(p => p.id === myParticipantId);
    const opponent = room.participants.find(p => p.id !== myParticipantId);
    if (!myParticipant || !opponent) return false;

    // Mute if opponent's speaking language differs from my listening language
    return opponent.speakingLanguage !== myParticipant.listeningLanguage;
  }, [room, myParticipantId]);

  // Apply raw audio muting based on language
  useEffect(() => {
    if (remoteStream) {
      const shouldMute = shouldMuteRawAudio();
      remoteStream.getAudioTracks().forEach(track => {
        track.enabled = !shouldMute;
      });
      console.log(`[Room] Raw audio ${shouldMute ? 'muted (different language)' : 'enabled (same language)'}`);
    }
  }, [remoteStream, shouldMuteRawAudio, room]);

  // No-op for TTS callbacks (raw audio muting is now automatic)
  const muteRemoteAudio = useCallback((_mute: boolean) => {
    // Raw audio muting is now handled by language detection, not TTS state
  }, []);

  // TTS playback hook - plays translated speech from opponent
  const {
    isPlaying: isTTSPlaying,
    handleAudioChunk: handleTTSAudioChunk,
    handleTTSStart: handleTTSStartPlayback,
    handleTTSEnd: handleTTSEndPlayback,
    setVolume: setTTSPlaybackVolume,
    initialize: initializeTTS,
  } = useAudioPlayback({
    enabled: ttsEnabled,  // "Hear Opponent" toggle controls this
    onPlaybackStart: (speakerId) => {
      console.log('[Room] TTS playback started for', speakerId);
      muteRemoteAudio(true);
    },
    onPlaybackEnd: (speakerId) => {
      console.log('[Room] TTS playback ended for', speakerId);
      muteRemoteAudio(false);
    },
  });

  // TTS event handlers
  // IMPORTANT: Don't play TTS of MY OWN speech - but DO play TTS of opponent's speech
  // The key check is: if speakerId === myParticipantId, don't play (it's my speech being read back)
  // If speakerId !== myParticipantId, DO play (it's my opponent's speech translated for me)

  const handleTTSStart = useCallback((message: TTSStartMessage) => {
    // Don't play TTS of my own speech
    if (message.speakerId === myParticipantId) {
      console.log('[Room] Ignoring TTS start - this is my own speech');
      return;
    }
    console.log('[Room] TTS starting for opponent:', message.speakerId);
    handleTTSStartPlayback(message.speakerId, message.speechId);
  }, [handleTTSStartPlayback, myParticipantId]);

  const handleTTSChunk = useCallback((message: TTSChunkMessage) => {
    // Don't play TTS of my own speech
    if (message.speakerId === myParticipantId) {
      return;
    }
    handleTTSAudioChunk(
      message.speakerId,
      message.chunkIndex,
      message.audioData,
      message.isFinal
    );
  }, [handleTTSAudioChunk, myParticipantId]);

  const handleTTSEnd = useCallback((message: TTSEndMessage) => {
    // Don't process TTS end for my own speech
    if (message.speakerId === myParticipantId) {
      return;
    }
    handleTTSEndPlayback(message.speakerId, message.speechId);
  }, [handleTTSEndPlayback, myParticipantId]);

  // Initialize TTS on first user interaction (for AudioContext)
  useEffect(() => {
    const initOnInteraction = () => {
      initializeTTS();
      window.removeEventListener('click', initOnInteraction);
    };
    window.addEventListener('click', initOnInteraction);
    return () => window.removeEventListener('click', initOnInteraction);
  }, [initializeTTS]);

  // Update TTS volume when changed
  useEffect(() => {
    setTTSPlaybackVolume(ttsVolume);
  }, [ttsVolume, setTTSPlaybackVolume]);

  // Practice mode helper (Milestone 5)
  const isPracticeMode = room?.mode === 'practice';

  // WebSocket connection
  const {
    setReady,
    setSide,
    setLanguages,
    startDebate,
    endSpeech,
    startNextSpeech,
    startPrep,
    endPrep,
    sendSignal,
    sendAnswer,
    sendIceCandidate,
    // Audio streaming (Milestone 2)
    startAudioStream,
    sendAudioChunk,
    stopAudioStream,
    // Voice selection (Milestone 3)
    requestVoiceList,
    selectVoice,
  } = useWebSocket({
    roomCode: roomId || '',
    displayName,
    botConfig: roomId === 'practice' ? botConfig : null,  // Milestone 5: Pass bot config for practice mode
    onSignal: handleSignal,
    onTranscript: handleTranscript,
    onTranslation: handleTranslation,
    onBallot: handleBallot,
    // TTS callbacks (Milestone 3)
    onTTSStart: handleTTSStart,
    onTTSChunk: handleTTSChunk,
    onTTSEnd: handleTTSEnd,
    onVoiceList: handleVoiceList,
    // Timeout callbacks
    onTimeoutWarning: handleTimeoutWarning,
    onTimeoutEnd: handleTimeoutEnd,
    // Bot callbacks (Milestone 5)
    onBotPrepStart: (speechRole, _botId) => {
      console.log('[Room] Bot prep started for:', speechRole);
      setIsBotPrepping(true);
      setBotTranscriptSentences([]);  // Clear transcript when prep starts
    },
    onBotPrepEnd: (speechRole) => {
      console.log('[Room] Bot prep ended, timer starting for:', speechRole);
      setIsBotPrepping(false);
    },
    onBotGenerating: (speechRole, _character) => {
      console.log('[Room] Bot generating speech:', speechRole);
      setIsBotGenerating(true);
    },
    onBotSpeechReady: (speechRole) => {
      console.log('[Room] Bot speech ready:', speechRole);
      setIsBotGenerating(false);
    },
    onBotTranscriptChunk: (sentence, index, total, _isFinal) => {
      console.log(`[Room] Bot transcript chunk ${index + 1}/${total}`);
      setBotTranscriptSentences(prev => {
        const newSentences = [...prev];
        newSentences[index] = sentence;
        return newSentences;
      });
      // Auto-scroll to latest sentence
      if (botTranscriptRef.current) {
        botTranscriptRef.current.scrollTop = botTranscriptRef.current.scrollHeight;
      }
    },
  });

  // Set signal senders ref for usePeer callback
  signalSendersRef.current = { sendSignal, sendAnswer, sendIceCandidate };

  // Get my participant data (needed early for audio streaming)
  const myParticipant = room?.participants.find(p => p.id === myParticipantId);

  // Track current speech for audio streaming
  const currentSpeechRef = useRef<SpeechRole | null>(null);

  // Determine if current user is the active speaker
  const isCurrentlySpeaking = room?.currentSpeaker === myParticipantId && room?.status === 'in_progress';

  // Audio chunk handler - sends audio data through WebSocket
  const handleAudioChunk = useCallback((chunk: ArrayBuffer) => {
    if (currentSpeechRef.current) {
      const base64Audio = arrayBufferToBase64(chunk);
      sendAudioChunk(base64Audio, currentSpeechRef.current);
    }
  }, [sendAudioChunk]);

  // Audio streaming hook
  const {
    isStreaming: isAudioStreaming,
    isInitialized: isAudioInitialized,
    error: audioError,
  } = useAudioStream({
    onAudioChunk: handleAudioChunk,
    enabled: isCurrentlySpeaking,
    mediaStream: localStream,
  });

  // Start/stop audio streaming based on speaking state
  useEffect(() => {
    if (isCurrentlySpeaking && room?.currentSpeech && myParticipant) {
      // Start audio stream for this speech
      currentSpeechRef.current = room.currentSpeech;
      startAudioStream(room.currentSpeech, myParticipant.speakingLanguage);
    } else if (!isCurrentlySpeaking && currentSpeechRef.current) {
      // Stop audio stream when no longer speaking
      stopAudioStream(currentSpeechRef.current);
      currentSpeechRef.current = null;
    }
  }, [isCurrentlySpeaking, room?.currentSpeech, myParticipant?.speakingLanguage, startAudioStream, stopAudioStream]);

  // Redirect to lobby if no room code
  useEffect(() => {
    if (!roomId) {
      navigate('/');
    }
  }, [roomId, navigate]);

  // Request camera access on mount
  useEffect(() => {
    getStream().catch((err) => {
      console.error('[Room] Failed to get media:', err);
    });
  }, []);

  // Process pending signals when localStream becomes available
  useEffect(() => {
    if (localStream && pendingSignalsRef.current.length > 0) {
      console.log('[Room] Processing', pendingSignalsRef.current.length, 'pending signals');
      const pending = [...pendingSignalsRef.current];
      pendingSignalsRef.current = [];

      // Process each pending signal in order
      (async () => {
        for (const message of pending) {
          const signalData = message.signal as SignalData;
          console.log('[Room] Processing queued signal:', signalData.type);
          await processSignal(signalData);
        }
      })();
    }
  }, [localStream, processSignal]);

  // Compute opponent outside the effect for more reliable dependency tracking
  const opponentForPeer = room?.participants.find(p => p.id !== myParticipantId);

  // Initiate peer connection when both participants are ready
  // Uses a retry mechanism to handle race conditions between localStream and room state updates
  useEffect(() => {
    // Only initiate if:
    // 1. We have local stream
    // 2. We have an opponent
    // 3. We haven't initiated yet
    // 4. We're the "initiator" (higher ID or host)
    const tryInitiate = () => {
      if (
        localStream &&
        opponentForPeer &&
        myParticipantId &&
        !hasInitiatedRef.current &&
        !isPeerConnected &&
        !isPeerConnecting
      ) {
        // Simple tie-breaker: compare IDs, higher ID initiates
        const shouldInitiate = myParticipantId > opponentForPeer.id;

        if (shouldInitiate) {
          console.log('[Room] Initiating peer connection');
          hasInitiatedRef.current = true;
          isInitiatorRef.current = true;
          createPeer(true);
          return true;
        }
      }
      return false;
    };

    // Try immediately
    if (tryInitiate()) return;

    // If conditions aren't met yet, retry every 500ms for up to 5 seconds
    // This handles race conditions where localStream or room state updates at different times
    if (localStream && opponentForPeer && !isPeerConnected && !isPeerConnecting && !hasInitiatedRef.current) {
      const retryInterval = setInterval(() => {
        if (tryInitiate() || hasInitiatedRef.current || isPeerConnected) {
          clearInterval(retryInterval);
        }
      }, 500);

      // Cleanup: stop retrying after 5 seconds or on unmount
      const timeout = setTimeout(() => clearInterval(retryInterval), 5000);

      return () => {
        clearInterval(retryInterval);
        clearTimeout(timeout);
      };
    }
  }, [localStream, opponentForPeer?.id, myParticipantId, isPeerConnected, isPeerConnecting, createPeer]);

  // Get opponent data
  const opponent = room?.participants.find(p => p.id !== myParticipantId);

  // Practice mode helpers (Milestone 5)
  const isOpponentBot = opponent?.isBot === true;
  const isBotSpeaking = isOpponentBot && room?.currentSpeaker === opponent?.id && room?.status === 'in_progress';

  // Connection status display
  const getStatusDisplay = () => {
    if (isConnecting) return { text: 'Connecting...', color: 'text-yellow-400' };
    if (connectionError) return { text: connectionError, color: 'text-red-400' };
    if (!isConnected) return { text: 'Disconnected', color: 'text-red-400' };
    if (!room) return { text: 'Loading room...', color: 'text-yellow-400' };
    if (room.participants.length < 2) return { text: 'Waiting for opponent...', color: 'text-yellow-400' };
    if (room.status === 'waiting') return { text: 'Setting up...', color: 'text-yellow-400' };
    if (room.status === 'ready') return { text: 'Ready to start!', color: 'text-green-400' };
    if (room.status === 'in_progress') return { text: 'Debate in progress', color: 'text-blue-400' };
    return { text: room.status, color: 'text-gray-400' };
  };

  const status = getStatusDisplay();

  // Handle side selection
  const handleSideSelect = (side: Side) => {
    setSide(side);
  };

  // Handle language change
  const handleLanguageChange = (type: 'speaking' | 'listening', lang: LanguageCode) => {
    if (myParticipant) {
      const speaking = type === 'speaking' ? lang : myParticipant.speakingLanguage;
      const listening = type === 'listening' ? lang : myParticipant.listeningLanguage;
      setLanguages(speaking, listening);
    }
  };

  // Request voices when speaking language changes
  useEffect(() => {
    if (myParticipant?.speakingLanguage && isConnected) {
      setVoicesLoading(true);
      setSelectedVoiceId(null); // Reset selection when language changes
      requestVoiceList(myParticipant.speakingLanguage);
    }
  }, [myParticipant?.speakingLanguage, isConnected, requestVoiceList]);

  // Handle voice selection
  const handleVoiceSelect = (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    selectVoice(voiceId);
  };

  // Handle ready toggle
  const handleReadyToggle = () => {
    if (myParticipant) {
      setReady(!myParticipant.isReady);
    }
  };

  // Handle video toggle
  const handleToggleVideo = () => {
    toggleVideo(!isVideoOn);
    setIsVideoOn(!isVideoOn);
  };

  // Handle audio toggle
  const handleToggleAudio = () => {
    toggleAudio(!isAudioOn);
    setIsAudioOn(!isAudioOn);
  };

  // Check if side is taken by opponent
  const isSideTaken = (side: Side) => opponent?.side === side;

  return (
    <>
      {/* Ballot Display (shown at end of debate) */}
      {ballotData && (
        <BallotDisplay
          ballot={ballotData.ballot}
          flowState={ballotData.flowState}
          onClose={() => setBallotData(null)}
        />
      )}

      {/* Timeout Warning Banner */}
      {timeoutWarning && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-600 text-white px-4 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold">
                {timeoutWarning.reason === 'inactivity' ? 'Inactivity Warning' : 'Time Limit Warning'}
              </p>
              <p className="text-sm opacity-90">{timeoutWarning.message}</p>
            </div>
          </div>
          <button
            onClick={() => setTimeoutWarning(null)}
            className="px-3 py-1 bg-yellow-700 hover:bg-yellow-800 rounded text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="card mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">
                  {isPracticeMode ? 'Practice Mode' : 'Debate Room'}
                </h1>
                {isPracticeMode && (
                  <span className="px-2 py-0.5 bg-purple-600 text-xs rounded-full">vs AI</span>
                )}
              </div>
              <p className="text-gray-400 text-sm">
                {isPracticeMode ? (
                  <>Bot: <span className="text-purple-400">{opponent?.displayName || 'AI'}</span></>
                ) : (
                  <>Room Code: <span className="font-mono text-white">{roomId}</span></>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Status</p>
              <p className={`font-medium ${status.color}`}>{status.text}</p>
            </div>
          </div>
        </div>

        {/* Resolution */}
        {room && (
          <div className="card mb-4">
            <h3 className="font-semibold mb-2">Resolution</h3>
            <p className="text-gray-300 italic">"{room.resolution}"</p>
          </div>
        )}

        {/* Start Debate Button - Only show when room is ready */}
        {room?.status === 'ready' && (
          <div className="card mb-4 text-center">
            <p className={isPracticeMode ? 'text-purple-400 mb-3' : 'text-green-400 mb-3'}>
              {isPracticeMode ? 'Ready to practice!' : 'Both debaters are ready!'}
            </p>
            <button
              onClick={startDebate}
              className={`px-8 py-3 rounded-lg font-bold text-lg transition-colors ${
                isPracticeMode
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isPracticeMode ? 'Start Practice Debate' : 'Start Debate'}
            </button>
          </div>
        )}

        {/* Timer - Only show during debate */}
        {room?.status === 'in_progress' && (
          <div className="mb-4">
            <Timer
              onEndSpeech={endSpeech}
              onStartPrep={startPrep}
              onEndPrep={endPrep}
              onStartNextSpeech={startNextSpeech}
            />
          </div>
        )}

        {/* Live Transcript - Only show during debate */}
        {room?.status === 'in_progress' && (
          <div className="mb-4">
            <TranscriptPanel
              myParticipantId={myParticipantId}
              myLanguage={myParticipant?.listeningLanguage}
            />
          </div>
        )}

        {/* Audio Controls - Show during debate */}
        {room?.status === 'in_progress' && (
          <div className="mb-4">
            <TTSSettings
              enabled={ttsEnabled}
              onEnabledChange={setTtsEnabled}
              volume={ttsVolume}
              onVolumeChange={setTtsVolume}
            />
          </div>
        )}

        {/* Debate Complete */}
        {room?.status === 'completed' && (
          <div className="card mb-4 text-center">
            <h2 className="text-2xl font-bold text-green-400 mb-2">Debate Complete!</h2>
            <p className="text-gray-400">Thank you for participating in this debate.</p>
          </div>
        )}

        {/* Video Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Local Video */}
          <div>
            <VideoPanel
              stream={localStream}
              isLocal={true}
              mirrored={true}
              label={myParticipant?.displayName || displayName}
              placeholder={
                <div className="text-center text-gray-500">
                  {isMediaLoading ? (
                    <>
                      <div className="animate-spin w-8 h-8 border-2 border-gray-500 border-t-blue-500 rounded-full mx-auto mb-2" />
                      <p className="text-sm">Accessing camera...</p>
                    </>
                  ) : mediaError ? (
                    <>
                      <div className="text-4xl mb-2">🚫</div>
                      <p className="text-sm text-red-400">Camera access denied</p>
                      <button
                        onClick={() => getStream()}
                        className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-4xl mb-2">📹</div>
                      <p className="text-sm">Click to enable camera</p>
                      <button
                        onClick={() => getStream()}
                        className="mt-2 btn btn-primary text-sm"
                      >
                        Enable Camera
                      </button>
                    </>
                  )}
                </div>
              }
            />
            {localStream && (
              <div className="mt-2">
                <VideoControls
                  isVideoEnabled={isVideoOn}
                  isAudioEnabled={isAudioOn}
                  onToggleVideo={handleToggleVideo}
                  onToggleAudio={handleToggleAudio}
                />
              </div>
            )}
          </div>

          {/* Remote Video / Bot Panel */}
          {isOpponentBot ? (
            // Bot opponent panel (Milestone 5)
            <div className="relative bg-gray-900 rounded-lg flex flex-col" style={{ minHeight: '300px' }}>
              {/* Bot header */}
              <div className="flex items-center gap-3 p-3 border-b border-gray-700">
                <div className="p-2 bg-purple-500/20 rounded-full">
                  <Bot className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">{opponent?.displayName}</p>
                  <p className="text-xs text-gray-400">AI Opponent</p>
                </div>
                {isBotPrepping && (
                  <div className="ml-auto flex items-center gap-2 text-yellow-400">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Preparing...</span>
                  </div>
                )}
                {isBotGenerating && !isBotPrepping && (
                  <div className="ml-auto flex items-center gap-2 text-purple-400">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                )}
                {isBotSpeaking && !isBotGenerating && !isBotPrepping && (
                  <div className="ml-auto flex items-center gap-2 text-green-400">
                    <Volume2 className="w-4 h-4" />
                    <span className="text-sm">Speaking...</span>
                  </div>
                )}
              </div>

              {/* Bot transcript - progressive display */}
              <div
                ref={botTranscriptRef}
                className="flex-1 overflow-y-auto p-3 space-y-2 text-sm"
                style={{ maxHeight: '250px' }}
              >
                {botTranscriptSentences.length > 0 ? (
                  botTranscriptSentences.map((sentence, idx) => (
                    <p
                      key={idx}
                      className={`text-gray-300 ${idx === botTranscriptSentences.length - 1 ? 'text-white font-medium' : ''}`}
                    >
                      {sentence}
                    </p>
                  ))
                ) : isBotPrepping ? (
                  <div className="flex flex-col items-center justify-center h-full text-yellow-400/70">
                    <Loader className="w-8 h-8 animate-spin mb-3" />
                    <p className="italic">Bot is preparing response...</p>
                    <p className="text-xs text-gray-500 mt-1">(Timer will start when ready)</p>
                  </div>
                ) : isBotSpeaking ? (
                  <p className="text-gray-500 italic">Bot is speaking...</p>
                ) : (
                  <p className="text-gray-500 italic text-center mt-8">
                    Bot transcript will appear here when speaking
                  </p>
                )}
              </div>
            </div>
          ) : (
            // Human opponent video panel
            <VideoPanel
              stream={remoteStream}
              isLocal={false}
              label={opponent?.displayName}
              isConnecting={isPeerConnecting}
              placeholder={
                <div className="text-center text-gray-500">
                  {opponent ? (
                    isPeerConnected ? (
                      <>
                        <div className="text-4xl mb-2">📹</div>
                        <p className="text-sm">Waiting for video...</p>
                      </>
                    ) : (
                      <>
                        <div className="animate-pulse text-4xl mb-2">🔗</div>
                        <p className="text-sm">Connecting to {opponent.displayName}...</p>
                      </>
                    )
                  ) : (
                    <>
                      <div className="text-4xl mb-2">👤</div>
                      <p className="text-sm">Waiting for opponent...</p>
                      <p className="text-xs mt-2 text-gray-600">
                        Share code: <span className="font-mono text-white">{roomId}</span>
                      </p>
                    </>
                  )}
                </div>
              }
            />
          )}
        </div>

        {/* Participants Setup - Hide during debate */}
        {room?.status !== 'in_progress' && room?.status !== 'completed' && (
          isPracticeMode ? (
            // Practice Mode: Simplified setup panel
            <div className="card mb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-purple-400">Match Setup</h3>
                {myParticipant?.isReady && opponent?.isReady && (
                  <span className="text-green-400 text-sm">Ready to start!</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* You */}
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">You</p>
                  <p className="font-medium">{myParticipant?.displayName}</p>
                  <p className={`text-sm ${myParticipant?.side === 'AFF' ? 'text-blue-400' : 'text-red-400'}`}>
                    {myParticipant?.side === 'AFF' ? 'Affirmative' : 'Negative'}
                  </p>
                </div>

                {/* Bot Opponent */}
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">AI Opponent</p>
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-400" />
                    <p className="font-medium">{opponent?.displayName}</p>
                  </div>
                  <p className={`text-sm ${opponent?.side === 'AFF' ? 'text-blue-400' : 'text-red-400'}`}>
                    {opponent?.side === 'AFF' ? 'Affirmative' : 'Negative'}
                  </p>
                </div>
              </div>

              {/* Ready Button for Practice Mode */}
              <button
                onClick={handleReadyToggle}
                className={`w-full py-2 rounded-lg font-medium transition-all ${
                  myParticipant?.isReady
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {myParticipant?.isReady ? 'Ready!' : 'Click when ready'}
              </button>
            </div>
          ) : (
            // PvP Mode: Full setup panel
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Me */}
              <div className={`card ${myParticipant?.isReady ? 'ring-2 ring-green-500' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{myParticipant?.displayName || displayName} (You)</h3>
                  {myParticipant?.isReady && (
                    <span className="text-green-400 text-sm">Ready</span>
                  )}
                </div>

                {/* Side Selection */}
                <div className="mb-4">
                  <p className="text-sm text-gray-400 mb-2">Select your side:</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSideSelect('AFF')}
                      disabled={isSideTaken('AFF')}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                        myParticipant?.side === 'AFF'
                          ? 'bg-blue-600 text-white'
                          : isSideTaken('AFF')
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                    >
                      AFF
                    </button>
                    <button
                      onClick={() => handleSideSelect('NEG')}
                      disabled={isSideTaken('NEG')}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                        myParticipant?.side === 'NEG'
                          ? 'bg-red-600 text-white'
                          : isSideTaken('NEG')
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                    >
                      NEG
                    </button>
                  </div>
                </div>

                {/* Language Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <LanguageSelector
                    label="I speak:"
                    value={myParticipant?.speakingLanguage || 'en'}
                    onChange={(code) => handleLanguageChange('speaking', code)}
                  />
                  <LanguageSelector
                    label="I want to hear:"
                    value={myParticipant?.listeningLanguage || 'en'}
                    onChange={(code) => handleLanguageChange('listening', code)}
                  />
                </div>

                {/* Voice Selection */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-1">
                    Your debate voice
                  </h4>
                  <p className="text-xs text-gray-500 mb-3">
                    How your opponent hears you when translated
                  </p>
                  <VoiceSelector
                    voices={availableVoices}
                    selectedVoiceId={selectedVoiceId}
                    onSelect={handleVoiceSelect}
                    loading={voicesLoading}
                    disabled={myParticipant?.isReady}
                  />
                </div>

                {/* Hear Opponent Settings (TTS) */}
                <div className="mt-4">
                  <TTSSettings
                    enabled={ttsEnabled}
                    onEnabledChange={setTtsEnabled}
                    volume={ttsVolume}
                    onVolumeChange={setTtsVolume}
                  />
                </div>

                {/* Ready Button */}
                <button
                  onClick={handleReadyToggle}
                  disabled={!myParticipant?.side}
                  className={`w-full mt-4 py-2 rounded-lg font-medium transition-all ${
                    myParticipant?.isReady
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : !myParticipant?.side
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {myParticipant?.isReady ? 'Ready!' : 'Click when ready'}
                </button>
              </div>

              {/* Opponent */}
              <div className={`card ${opponent?.isReady ? 'ring-2 ring-green-500' : ''}`}>
                {opponent ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">{opponent.displayName}</h3>
                      {opponent.isReady && (
                        <span className="text-green-400 text-sm">Ready</span>
                      )}
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Side:</span>
                        <span className={opponent.side === 'AFF' ? 'text-blue-400' : opponent.side === 'NEG' ? 'text-red-400' : 'text-gray-500'}>
                          {opponent.side || 'Not selected'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Speaks:</span>
                        <span>{LANGUAGES.find(l => l.code === opponent.speakingLanguage)?.flag} {opponent.speakingLanguage.toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Listening:</span>
                        <span>{LANGUAGES.find(l => l.code === opponent.listeningLanguage)?.flag} {opponent.listeningLanguage.toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Video:</span>
                        <span className={isPeerConnected ? 'text-green-400' : 'text-yellow-400'}>
                          {isPeerConnected ? 'Connected' : isPeerConnecting ? 'Connecting...' : 'Waiting'}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-4xl mb-2">👤</div>
                    <p>Waiting for opponent...</p>
                    <p className="text-sm mt-2">Share the room code: <span className="font-mono text-white">{roomId}</span></p>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* Debug info */}
        {import.meta.env.DEV && (
          <div className="card mt-4 text-xs text-gray-500 space-y-1">
            <p>WS: connected={String(isConnected)}, myId={myParticipantId || 'none'}</p>
            <p>Room: participants={room?.participants.length || 0}, status={room?.status || 'none'}, mode={room?.mode || 'pvp'}</p>
            <p>Video: local={localStream ? 'yes' : 'no'}, remote={remoteStream ? 'yes' : 'no'}</p>
            <p>Peer: connected={String(isPeerConnected)}, connecting={String(isPeerConnecting)}</p>
            <p>Audio: initialized={String(isAudioInitialized)}, streaming={String(isAudioStreaming)}, speaking={String(isCurrentlySpeaking)}</p>
            <p>TTS: enabled={String(ttsEnabled)}, playing={String(isTTSPlaying)}, volume={ttsVolume}</p>
            {isPracticeMode && <p className="text-purple-400">Practice: bot={opponent?.displayName}, botGenerating={String(isBotGenerating)}</p>}
            {audioError && <p className="text-red-400">Audio Error: {audioError.message}</p>}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
