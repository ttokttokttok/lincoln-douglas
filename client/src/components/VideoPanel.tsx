import { useRef, useEffect } from 'react';

interface VideoPanelProps {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  label?: string;
  isLocal?: boolean;
  isConnecting?: boolean;
  placeholder?: React.ReactNode;
}

export function VideoPanel({
  stream,
  muted = false,
  mirrored = false,
  label,
  isLocal = false,
  isConnecting = false,
  placeholder,
}: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach stream to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      console.log(`[VideoPanel] ${label || 'Video'} stream attached`);
    } else {
      video.srcObject = null;
    }

    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, [stream, label]);

  return (
    <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted || isLocal} // Always mute local to prevent feedback
          className={`w-full h-full object-cover ${mirrored ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          {isConnecting ? (
            <div className="text-center text-gray-400">
              <div className="animate-spin w-8 h-8 border-2 border-gray-500 border-t-blue-500 rounded-full mx-auto mb-2" />
              <p className="text-sm">Connecting...</p>
            </div>
          ) : placeholder ? (
            placeholder
          ) : (
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-2">{isLocal ? '📹' : '👤'}</div>
              <p className="text-sm">
                {isLocal ? 'Camera off' : 'Waiting for video...'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Label overlay */}
      {label && (
        <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-sm text-white">
          {label}
        </div>
      )}

      {/* Local indicator */}
      {isLocal && stream && (
        <div className="absolute top-2 right-2 bg-blue-600 px-2 py-1 rounded text-xs text-white">
          You
        </div>
      )}
    </div>
  );
}

interface VideoControlsProps {
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
  disabled?: boolean;
}

export function VideoControls({
  isVideoEnabled,
  isAudioEnabled,
  onToggleVideo,
  onToggleAudio,
  disabled = false,
}: VideoControlsProps) {
  return (
    <div className="flex gap-2 justify-center">
      <button
        onClick={onToggleVideo}
        disabled={disabled}
        className={`p-3 rounded-full transition-colors ${
          isVideoEnabled
            ? 'bg-gray-700 hover:bg-gray-600 text-white'
            : 'bg-red-600 hover:bg-red-700 text-white'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
      >
        {isVideoEnabled ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        )}
      </button>

      <button
        onClick={onToggleAudio}
        disabled={disabled}
        className={`p-3 rounded-full transition-colors ${
          isAudioEnabled
            ? 'bg-gray-700 hover:bg-gray-600 text-white'
            : 'bg-red-600 hover:bg-red-700 text-white'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
      >
        {isAudioEnabled ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        )}
      </button>
    </div>
  );
}
