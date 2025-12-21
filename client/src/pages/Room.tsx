import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useMediaStream } from '../hooks/useMediaStream';
import { usePeer, type SignalData } from '../hooks/usePeer';
import { useRoomStore } from '../stores/roomStore';
import { VideoPanel, VideoControls } from '../components/VideoPanel';
import type { LanguageCode, Side } from '@shared/types';
import { LANGUAGES } from '@shared/types';

export function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [displayName] = useState(() => sessionStorage.getItem('displayName') || 'Anonymous');

  // Remote stream state
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Video/audio enabled state
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);

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
    destroy: destroyPeer,
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

  // WebSocket connection
  const {
    setReady,
    setSide,
    setLanguages,
    sendSignal,
    sendAnswer,
    sendIceCandidate,
  } = useWebSocket({
    roomCode: roomId || '',
    displayName,
    onSignal: handleSignal,
  });

  // Set signal senders ref for usePeer callback
  signalSendersRef.current = { sendSignal, sendAnswer, sendIceCandidate };

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

  // Get my participant data
  const myParticipant = room?.participants.find(p => p.id === myParticipantId);
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

        {/* Participants Setup */}
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
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-400 mb-1">I speak:</p>
                <div className="flex gap-1 flex-wrap">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={`speak-${lang.code}`}
                      onClick={() => handleLanguageChange('speaking', lang.code)}
                      className={`px-2 py-1 rounded text-sm ${
                        myParticipant?.speakingLanguage === lang.code
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {lang.flag} {lang.code.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">I want to hear:</p>
                <div className="flex gap-1 flex-wrap">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={`listen-${lang.code}`}
                      onClick={() => handleLanguageChange('listening', lang.code)}
                      className={`px-2 py-1 rounded text-sm ${
                        myParticipant?.listeningLanguage === lang.code
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {lang.flag} {lang.code.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
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

        {/* Debug info */}
        {import.meta.env.DEV && (
          <div className="card mt-4 text-xs text-gray-500 space-y-1">
            <p>WS: connected={String(isConnected)}, myId={myParticipantId || 'none'}</p>
            <p>Room: participants={room?.participants.length || 0}, status={room?.status || 'none'}</p>
            <p>Video: local={localStream ? 'yes' : 'no'}, remote={remoteStream ? 'yes' : 'no'}</p>
            <p>Peer: connected={String(isPeerConnected)}, connecting={String(isPeerConnecting)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
