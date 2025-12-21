import { useRef, useCallback, useEffect, useState } from 'react';
import { ICE_SERVERS } from '../lib/constants';

// Signal data type (compatible with what we send over WebSocket)
export interface SignalData {
  type: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

interface UsePeerOptions {
  localStream: MediaStream | null;
  onRemoteStream: (stream: MediaStream) => void;
  onSignal: (signal: SignalData) => void;
  onConnect?: () => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
}

interface PeerState {
  isConnecting: boolean;
  isConnected: boolean;
  error: Error | null;
}

export function usePeer(options: UsePeerOptions) {
  const {
    localStream,
    onRemoteStream,
    onSignal,
    onConnect,
    onClose,
    onError,
  } = options;

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const [state, setState] = useState<PeerState>({
    isConnecting: false,
    isConnected: false,
    error: null,
  });

  // Create peer connection
  const createPeer = useCallback(async (initiator: boolean) => {
    if (!localStream) {
      console.warn('[Peer] Cannot create peer: no local stream');
      return null;
    }

    // Cleanup existing peer if any
    if (peerRef.current) {
      console.log('[Peer] Destroying existing peer');
      peerRef.current.close();
      peerRef.current = null;
    }

    console.log(`[Peer] Creating ${initiator ? 'initiator' : 'responder'} peer`);
    setState({ isConnecting: true, isConnected: false, error: null });

    try {
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
      });

      peerRef.current = pc;

      // Add local tracks to the connection
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
        console.log(`[Peer] Added ${track.kind} track`);
      });

      // Handle incoming tracks (remote stream)
      pc.ontrack = (event) => {
        console.log('[Peer] Received remote track:', event.track.kind);
        if (event.streams && event.streams[0]) {
          onRemoteStream(event.streams[0]);
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[Peer] ICE candidate');
          onSignal({
            type: 'candidate',
            candidate: event.candidate.toJSON(),
          });
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('[Peer] Connection state:', pc.connectionState);
        switch (pc.connectionState) {
          case 'connected':
            setState({ isConnecting: false, isConnected: true, error: null });
            onConnect?.();
            break;
          case 'disconnected':
          case 'failed':
          case 'closed':
            setState({ isConnecting: false, isConnected: false, error: null });
            onClose?.();
            break;
        }
      };

      // Handle ICE connection state
      pc.oniceconnectionstatechange = () => {
        console.log('[Peer] ICE state:', pc.iceConnectionState);
      };

      // If initiator, create and send offer
      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('[Peer] Created offer');
        onSignal({
          type: 'offer',
          sdp: offer.sdp,
        });
      }

      return pc;
    } catch (err) {
      console.error('[Peer] Error creating peer:', err);
      setState({ isConnecting: false, isConnected: false, error: err as Error });
      onError?.(err as Error);
      return null;
    }
  }, [localStream, onSignal, onRemoteStream, onConnect, onClose, onError]);

  // Handle incoming signal from remote peer
  const signal = useCallback(async (data: SignalData) => {
    const pc = peerRef.current;

    if (!pc) {
      console.warn('[Peer] No peer connection to signal');
      return;
    }

    try {
      if (data.type === 'offer') {
        console.log('[Peer] Received offer');
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'offer',
          sdp: data.sdp,
        }));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('[Peer] Created answer');
        onSignal({
          type: 'answer',
          sdp: answer.sdp,
        });
      } else if (data.type === 'answer') {
        console.log('[Peer] Received answer');
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp: data.sdp,
        }));
      } else if (data.type === 'candidate' && data.candidate) {
        console.log('[Peer] Received ICE candidate');
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err) {
      console.error('[Peer] Signal error:', err);
      onError?.(err as Error);
    }
  }, [onSignal, onError]);

  // Destroy peer connection
  const destroy = useCallback(() => {
    if (peerRef.current) {
      console.log('[Peer] Destroying peer');
      peerRef.current.close();
      peerRef.current = null;
      setState({ isConnecting: false, isConnected: false, error: null });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
    };
  }, []);

  return {
    peer: peerRef.current,
    isConnecting: state.isConnecting,
    isConnected: state.isConnected,
    error: state.error,
    createPeer,
    signal,
    destroy,
  };
}
