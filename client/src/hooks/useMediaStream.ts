import { useState, useCallback, useEffect, useRef } from 'react';

interface MediaStreamState {
  stream: MediaStream | null;
  error: Error | null;
  isLoading: boolean;
  hasPermission: boolean;
}

interface UseMediaStreamOptions {
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaTrackConstraints;
  autoStart?: boolean;
}

const defaultOptions: UseMediaStreamOptions = {
  video: true,
  audio: true,
  autoStart: false,
};

export function useMediaStream(options: UseMediaStreamOptions = defaultOptions) {
  const [state, setState] = useState<MediaStreamState>({
    stream: null,
    error: null,
    isLoading: false,
    hasPermission: false,
  });

  const streamRef = useRef<MediaStream | null>(null);

  // Get user media stream
  const getStream = useCallback(async () => {
    // Don't request again if already loading or have stream
    if (state.isLoading) return state.stream;
    if (streamRef.current) return streamRef.current;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const constraints: MediaStreamConstraints = {
        video: options.video ?? true,
        audio: options.audio ?? true,
      };

      console.log('[MediaStream] Requesting access with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      streamRef.current = stream;
      setState({
        stream,
        error: null,
        isLoading: false,
        hasPermission: true,
      });

      console.log('[MediaStream] Got stream:', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      return stream;
    } catch (error) {
      console.error('[MediaStream] Error:', error);
      const err = error as Error;
      setState({
        stream: null,
        error: err,
        isLoading: false,
        hasPermission: false,
      });
      throw error;
    }
  }, [options.video, options.audio, state.isLoading]);

  // Stop all tracks and release stream
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      console.log('[MediaStream] Stopping stream');
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log(`[MediaStream] Stopped ${track.kind} track`);
      });
      streamRef.current = null;
      setState({
        stream: null,
        error: null,
        isLoading: false,
        hasPermission: false,
      });
    }
  }, []);

  // Toggle video track
  const toggleVideo = useCallback((enabled?: boolean) => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = enabled ?? !track.enabled;
        console.log(`[MediaStream] Video ${track.enabled ? 'enabled' : 'disabled'}`);
      });
    }
  }, []);

  // Toggle audio track
  const toggleAudio = useCallback((enabled?: boolean) => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = enabled ?? !track.enabled;
        console.log(`[MediaStream] Audio ${track.enabled ? 'muted' : 'unmuted'}`);
      });
    }
  }, []);

  // Check if video is enabled
  const isVideoEnabled = useCallback(() => {
    if (!streamRef.current) return false;
    const videoTracks = streamRef.current.getVideoTracks();
    return videoTracks.length > 0 && videoTracks[0].enabled;
  }, []);

  // Check if audio is enabled
  const isAudioEnabled = useCallback(() => {
    if (!streamRef.current) return false;
    const audioTracks = streamRef.current.getAudioTracks();
    return audioTracks.length > 0 && audioTracks[0].enabled;
  }, []);

  // Auto-start stream if option is set
  useEffect(() => {
    if (options.autoStart) {
      getStream();
    }
  }, [options.autoStart]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return {
    stream: state.stream,
    error: state.error,
    isLoading: state.isLoading,
    hasPermission: state.hasPermission,
    getStream,
    stopStream,
    toggleVideo,
    toggleAudio,
    isVideoEnabled,
    isAudioEnabled,
  };
}
