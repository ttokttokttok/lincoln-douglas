/**
 * useAudioPlayback Hook
 *
 * React hook for TTS audio playback integration.
 * Handles audio chunks from WebSocket and manages playback state.
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { audioPlaybackManager } from '../lib/audioPlayback';

interface UseAudioPlaybackOptions {
  /** Whether TTS playback is enabled */
  enabled: boolean;
  /** Callback when playback starts for a speaker */
  onPlaybackStart?: (speakerId: string) => void;
  /** Callback when playback ends for a speaker */
  onPlaybackEnd?: (speakerId: string) => void;
  /** Callback on playback error */
  onError?: (error: Error) => void;
}

interface AudioPlaybackState {
  /** Whether any TTS is currently playing */
  isPlaying: boolean;
  /** Current volume (0-1) */
  volume: number;
  /** ID of the speaker currently playing */
  activeSpeakerId: string | null;
  /** Whether the audio context is ready */
  isReady: boolean;
}

interface AudioPlaybackControls {
  /** Handle incoming TTS audio chunk from WebSocket */
  handleAudioChunk: (
    speakerId: string,
    chunkIndex: number,
    audioData: string,
    isFinal: boolean
  ) => Promise<void>;
  /** Handle TTS start message */
  handleTTSStart: (speakerId: string, speechId: string) => void;
  /** Handle TTS end message */
  handleTTSEnd: (speakerId: string, speechId: string) => void;
  /** Set playback volume */
  setVolume: (volume: number) => void;
  /** Stop playback for a specific speaker or all */
  stop: (speakerId?: string) => void;
  /** Initialize audio context (call on user interaction) */
  initialize: () => Promise<void>;
}

export function useAudioPlayback(
  options: UseAudioPlaybackOptions
): AudioPlaybackState & AudioPlaybackControls {
  const { enabled, onPlaybackStart, onPlaybackEnd, onError } = options;

  const [state, setState] = useState<AudioPlaybackState>({
    isPlaying: false,
    volume: 1.0,
    activeSpeakerId: null,
    isReady: false,
  });

  // Track active speakers for end detection
  const activeSpeakersRef = useRef<Set<string>>(new Set());
  // Track if we've notified about playback start
  const notifiedStartRef = useRef<Set<string>>(new Set());

  /**
   * Initialize audio context
   */
  const initialize = useCallback(async () => {
    try {
      await audioPlaybackManager.initialize();
      setState(prev => ({ ...prev, isReady: audioPlaybackManager.isReady() }));
    } catch (error) {
      console.error('[useAudioPlayback] Failed to initialize:', error);
      onError?.(error as Error);
    }
  }, [onError]);

  /**
   * Handle TTS start message
   */
  const handleTTSStart = useCallback((speakerId: string, _speechId: string) => {
    if (!enabled) return;

    activeSpeakersRef.current.add(speakerId);
    console.log(`[useAudioPlayback] TTS starting for ${speakerId}`);
  }, [enabled]);

  /**
   * Handle incoming audio chunk
   */
  const handleAudioChunk = useCallback(
    async (
      speakerId: string,
      chunkIndex: number,
      audioData: string,
      isFinal: boolean
    ) => {
      if (!enabled) return;

      try {
        // Initialize on first chunk if needed
        if (!audioPlaybackManager.isReady()) {
          await audioPlaybackManager.initialize();
          setState(prev => ({ ...prev, isReady: true }));
        }

        // Queue the chunk for playback
        await audioPlaybackManager.queueChunk(speakerId, chunkIndex, audioData, isFinal);

        // Notify playback start on first chunk
        if (!notifiedStartRef.current.has(speakerId)) {
          notifiedStartRef.current.add(speakerId);
          setState(prev => ({
            ...prev,
            isPlaying: true,
            activeSpeakerId: speakerId,
          }));
          onPlaybackStart?.(speakerId);
        }

      } catch (error) {
        console.error('[useAudioPlayback] Error handling chunk:', error);
        onError?.(error as Error);
      }
    },
    [enabled, onPlaybackStart, onError]
  );

  /**
   * Handle TTS end message
   */
  const handleTTSEnd = useCallback((speakerId: string, _speechId: string) => {
    if (!enabled) return;

    activeSpeakersRef.current.delete(speakerId);
    console.log(`[useAudioPlayback] TTS ended for ${speakerId}`);

    // Check playback state after a delay to allow queue to drain
    const checkPlaybackEnd = () => {
      const playbackState = audioPlaybackManager.getState(speakerId);

      if (!playbackState.isPlaying && playbackState.bufferedChunks === 0) {
        // Playback complete
        notifiedStartRef.current.delete(speakerId);

        const stillPlaying = audioPlaybackManager.isAnyPlaying();
        setState(prev => ({
          ...prev,
          isPlaying: stillPlaying,
          activeSpeakerId: stillPlaying ? audioPlaybackManager.getActiveSpeakerId() : null,
        }));

        onPlaybackEnd?.(speakerId);
      } else {
        // Still playing, check again
        setTimeout(checkPlaybackEnd, 100);
      }
    };

    // Start checking after a short delay
    setTimeout(checkPlaybackEnd, 100);
  }, [enabled, onPlaybackEnd]);

  /**
   * Set playback volume
   */
  const setVolume = useCallback((volume: number) => {
    audioPlaybackManager.setVolume(volume);
    setState(prev => ({ ...prev, volume }));
  }, []);

  /**
   * Stop playback
   */
  const stop = useCallback((speakerId?: string) => {
    if (speakerId) {
      audioPlaybackManager.stop(speakerId);
      notifiedStartRef.current.delete(speakerId);
      activeSpeakersRef.current.delete(speakerId);
    } else {
      audioPlaybackManager.stopAll();
      notifiedStartRef.current.clear();
      activeSpeakersRef.current.clear();
    }

    const stillPlaying = audioPlaybackManager.isAnyPlaying();
    setState(prev => ({
      ...prev,
      isPlaying: stillPlaying,
      activeSpeakerId: stillPlaying ? audioPlaybackManager.getActiveSpeakerId() : null,
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioPlaybackManager.stopAll();
    };
  }, []);

  // Stop all playback when disabled
  useEffect(() => {
    if (!enabled) {
      audioPlaybackManager.stopAll();
      notifiedStartRef.current.clear();
      activeSpeakersRef.current.clear();
      setState(prev => ({
        ...prev,
        isPlaying: false,
        activeSpeakerId: null,
      }));
    }
  }, [enabled]);

  return {
    ...state,
    handleAudioChunk,
    handleTTSStart,
    handleTTSEnd,
    setVolume,
    stop,
    initialize,
  };
}
