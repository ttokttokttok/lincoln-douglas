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

  // TTS state (Milestone 3)
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [ttsVolume, setTtsVolume] = useState(1.0);

  // Voice selection state
  const [availableVoices, setAvailableVoices] = useState<VoiceConfig[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(false);

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

  // Process a single signal (creates peer if needed)
  const processSignal = useCallback(async (signalData: SignalData) => {
    // If we receive an offer and don't have a peer yet, create one as responder
    if (signalData.type === 'offer' && !hasPeerRef.current) {
      console.log('[Room] Creating responder peer for incoming offer');
      hasPeerRef.current = true; // Mark as creating to prevent duplicates
      await createPeer(false);
    }

    // Process the signal
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

  // Mute/unmute remote audio when TTS is playing
  const muteRemoteAudio = useCallback((mute: boolean) => {
    if (remoteStream) {
      remoteStream.getAudioTracks().forEach(track => {
        track.enabled = !mute;
      });
      console.log(`[Room] Remote audio ${mute ? 'muted' : 'unmuted'} for TTS`);
    }
  }, [remoteStream]);

  // TTS playback hook
  const {
    isPlaying: isTTSPlaying,
    handleAudioChunk: handleTTSAudioChunk,
    handleTTSStart: handleTTSStartPlayback,
    handleTTSEnd: handleTTSEndPlayback,
    setVolume: setTTSPlaybackVolume,
    initialize: initializeTTS,
  } = useAudioPlayback({
    enabled: ttsEnabled,
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
  // IMPORTANT: Don't play TTS when it's my turn to speak - prevents audio overlap
  const amICurrentSpeaker = room?.currentSpeaker === myParticipantId && room?.status === 'in_progress';

  const handleTTSStart = useCallback((message: TTSStartMessage) => {
    // Don't start TTS playback if I'm currently speaking
    if (amICurrentSpeaker) {
      console.log('[Room] Ignoring TTS start - I am currently speaking');
      return;
    }
    handleTTSStartPlayback(message.speakerId, message.speechId);
  }, [handleTTSStartPlayback, amICurrentSpeaker]);

  const handleTTSChunk = useCallback((message: TTSChunkMessage) => {
    // Don't queue TTS audio if I'm currently speaking
    if (amICurrentSpeaker) {
      return;
    }
    handleTTSAudioChunk(
      message.speakerId,
      message.chunkIndex,
      message.audioData,
      message.isFinal
    );
  }, [handleTTSAudioChunk, amICurrentSpeaker]);

  const handleTTSEnd = useCallback((message: TTSEndMessage) => {
    // Don't process TTS end if I'm currently speaking
    if (amICurrentSpeaker) {
      return;
    }
    handleTTSEndPlayback(message.speakerId, message.speechId);
  }, [handleTTSEndPlayback, amICurrentSpeaker]);

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

  // Initiate peer connection when both participants are ready
  useEffect(() => {
    const opponent = room?.participants.find(p => p.id !== myParticipantId);

    // Only initiate if:
    // 1. We have local stream
    // 2. We have an opponent
    // 3. We haven't initiated yet
    // 4. We're the "initiator" (higher ID or host)
    if (
      localStream &&
      opponent &&
      myParticipantId &&
      !hasInitiatedRef.current &&
      !isPeerConnected &&
      !isPeerConnecting
    ) {
      // Simple tie-breaker: compare IDs, higher ID initiates
      const shouldInitiate = myParticipantId > opponent.id;

      if (shouldInitiate) {
        console.log('[Room] Initiating peer connection');
        hasInitiatedRef.current = true;
        isInitiatorRef.current = true;
        createPeer(true);
      }
    }
  }, [localStream, room, myParticipantId, isPeerConnected, isPeerConnecting, createPeer]);

  // Get opponent data
  const opponent = room?.participants.find(p => p.id !== myParticipantId);

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
              <h1 className="text-xl font-bold">Debate Room</h1>
              <p className="text-gray-400 text-sm">
                Room Code: <span className="font-mono text-white">{roomId}</span>
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
            <p className="text-green-400 mb-3">Both debaters are ready!</p>
            <button
              onClick={startDebate}
              className="px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold text-lg transition-colors"
            >
              Start Debate
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

          {/* Remote Video */}
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
        </div>

        {/* Participants Setup - Hide during debate */}
        {room?.status !== 'in_progress' && room?.status !== 'completed' && (
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

            {/* TTS Settings */}
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
        )}

        {/* Debug info */}
        {import.meta.env.DEV && (
          <div className="card mt-4 text-xs text-gray-500 space-y-1">
            <p>WS: connected={String(isConnected)}, myId={myParticipantId || 'none'}</p>
            <p>Room: participants={room?.participants.length || 0}, status={room?.status || 'none'}</p>
            <p>Video: local={localStream ? 'yes' : 'no'}, remote={remoteStream ? 'yes' : 'no'}</p>
            <p>Peer: connected={String(isPeerConnected)}, connecting={String(isPeerConnecting)}</p>
            <p>Audio: initialized={String(isAudioInitialized)}, streaming={String(isAudioStreaming)}, speaking={String(isCurrentlySpeaking)}</p>
            <p>TTS: enabled={String(ttsEnabled)}, playing={String(isTTSPlaying)}, volume={ttsVolume}</p>
            {audioError && <p className="text-red-400">Audio Error: {audioError.message}</p>}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
