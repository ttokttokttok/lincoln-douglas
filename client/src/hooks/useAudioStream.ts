import { useRef, useCallback, useState, useEffect } from 'react';

interface UseAudioStreamOptions {
  /**
   * Callback fired when a new audio chunk is ready
   * @param chunk - ArrayBuffer containing 16-bit PCM audio at 16kHz
   */
  onAudioChunk: (chunk: ArrayBuffer) => void;
  
  /**
   * Whether audio streaming is enabled
   * When false, audio capture is paused
   */
  enabled: boolean;
  
  /**
   * Source MediaStream (from useMediaStream hook)
   * Must have audio tracks
   */
  mediaStream: MediaStream | null;
}

interface AudioStreamState {
  isInitialized: boolean;
  isStreaming: boolean;
  error: Error | null;
  sampleRate: number;
}

/**
 * Hook for capturing audio from a MediaStream and converting to PCM chunks
 * suitable for Google Cloud Speech-to-Text.
 * 
 * Uses AudioWorklet for low-latency processing in a separate thread.
 * Output: 16-bit PCM, 16kHz, mono, ~100ms chunks
 */
export function useAudioStream(options: UseAudioStreamOptions) {
  const { onAudioChunk, enabled, mediaStream } = options;
  
  const [state, setState] = useState<AudioStreamState>({
    isInitialized: false,
    isStreaming: false,
    error: null,
    sampleRate: 0,
  });
  
  // Refs to persist across renders
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const onAudioChunkRef = useRef(onAudioChunk);
  
  // Keep callback ref updated
  useEffect(() => {
    onAudioChunkRef.current = onAudioChunk;
  }, [onAudioChunk]);
  
  /**
   * Initialize AudioContext and load the worklet processor
   */
  const initialize = useCallback(async () => {
    if (!mediaStream) {
      return;
    }
    
    // Check if already initialized
    if (audioContextRef.current) {
      return;
    }
    
    try {
      // Create AudioContext
      const audioContext = new AudioContext({
        sampleRate: 48000, // Standard browser sample rate
      });
      audioContextRef.current = audioContext;
      
      // Load the worklet processor
      await audioContext.audioWorklet.addModule('/audio-worklet-processor.js');
      
      // Create worklet node
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-audio-processor');
      workletNodeRef.current = workletNode;
      
      // Handle messages from worklet
      workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audio') {
          onAudioChunkRef.current(event.data.audioData);
        }
      };
      
      // Create source node from MediaStream
      const sourceNode = audioContext.createMediaStreamSource(mediaStream);
      sourceNodeRef.current = sourceNode;
      
      // Connect: source -> worklet -> destination (required but we won't hear it)
      sourceNode.connect(workletNode);
      // Don't connect to destination - we don't want to hear our own audio
      // workletNode.connect(audioContext.destination);
      
      setState({
        isInitialized: true,
        isStreaming: false,
        error: null,
        sampleRate: audioContext.sampleRate,
      });
      
      console.log('[AudioStream] Initialized with sample rate:', audioContext.sampleRate);
    } catch (error) {
      console.error('[AudioStream] Failed to initialize:', error);
      setState(prev => ({
        ...prev,
        error: error as Error,
      }));
    }
  }, [mediaStream]);
  
  /**
   * Start streaming audio
   */
  const startStreaming = useCallback(() => {
    if (!workletNodeRef.current) {
      console.warn('[AudioStream] Cannot start - not initialized');
      return;
    }
    
    // Resume AudioContext if suspended (browser autoplay policy)
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    // Tell worklet to start streaming
    workletNodeRef.current.port.postMessage({ type: 'start' });
    
    setState(prev => ({
      ...prev,
      isStreaming: true,
    }));
    
    console.log('[AudioStream] Started streaming');
  }, []);
  
  /**
   * Stop streaming audio
   */
  const stopStreaming = useCallback(() => {
    if (!workletNodeRef.current) {
      return;
    }
    
    // Tell worklet to stop and flush buffer
    workletNodeRef.current.port.postMessage({ type: 'stop' });
    
    setState(prev => ({
      ...prev,
      isStreaming: false,
    }));
    
    console.log('[AudioStream] Stopped streaming');
  }, []);
  
  /**
   * Clean up resources
   */
  const cleanup = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setState({
      isInitialized: false,
      isStreaming: false,
      error: null,
      sampleRate: 0,
    });
    
    console.log('[AudioStream] Cleaned up');
  }, []);
  
  // Initialize when mediaStream becomes available
  useEffect(() => {
    if (mediaStream && !state.isInitialized) {
      initialize();
    }
  }, [mediaStream, state.isInitialized, initialize]);
  
  // Start/stop streaming based on enabled prop
  useEffect(() => {
    if (!state.isInitialized) {
      return;
    }
    
    if (enabled && !state.isStreaming) {
      startStreaming();
    } else if (!enabled && state.isStreaming) {
      stopStreaming();
    }
  }, [enabled, state.isInitialized, state.isStreaming, startStreaming, stopStreaming]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);
  
  return {
    ...state,
    startStreaming,
    stopStreaming,
    cleanup,
  };
}

/**
 * Utility to convert ArrayBuffer to Base64 for transmission
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Utility to convert Base64 back to ArrayBuffer (for server-side)
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

