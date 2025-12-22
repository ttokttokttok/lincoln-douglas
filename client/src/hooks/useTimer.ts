import { useMemo } from 'react';
import { useRoomStore } from '../stores/roomStore';
import type { SpeechRole, Side } from '@shared/types';
import { SPEECH_ORDER, SPEECH_SIDES } from '@shared/types';

// Format seconds to MM:SS display
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Get speech display name
export function getSpeechName(speech: SpeechRole): string {
  const names: Record<SpeechRole, string> = {
    AC: 'Affirmative Constructive',
    NC: 'Negative Constructive',
    '1AR': 'First Affirmative Rebuttal',
    NR: 'Negative Rebuttal',
    '2AR': 'Second Affirmative Rebuttal',
  };
  return names[speech];
}

// Get abbreviated speech name
export function getSpeechAbbrev(speech: SpeechRole): string {
  return speech;
}

// Get which side speaks for a speech
export function getSpeechSide(speech: SpeechRole): Side {
  return SPEECH_SIDES[speech];
}

// Get next speech in order
export function getNextSpeech(currentSpeech: SpeechRole): SpeechRole | null {
  const currentIndex = SPEECH_ORDER.indexOf(currentSpeech);
  if (currentIndex === -1 || currentIndex >= SPEECH_ORDER.length - 1) {
    return null;
  }
  return SPEECH_ORDER[currentIndex + 1];
}

// Hook that provides timer state and derived values
export function useTimer() {
  const timer = useRoomStore((state) => state.timer);
  const room = useRoomStore((state) => state.room);
  const myParticipantId = useRoomStore((state) => state.myParticipantId);
  const pendingNextSpeech = useRoomStore((state) => state.pendingNextSpeech);

  const derived = useMemo(() => {
    if (!timer) {
      return {
        displayTime: '0:00',
        isLowTime: false,
        isCriticalTime: false,
        currentSpeechName: null,
        currentSpeakerSide: null,
        isMyTurn: false,
        myPrepTime: 0,
        opponentPrepTime: 0,
        mySide: null as Side | null,
        opponentSide: null as Side | null,
        nextSpeech: null as SpeechRole | null,
      };
    }

    const displayTime = formatTime(timer.speechTimeRemaining);
    const isLowTime = timer.speechTimeRemaining <= 30 && timer.speechTimeRemaining > 10;
    const isCriticalTime = timer.speechTimeRemaining <= 10;

    // Get current speech info
    const currentSpeechName = timer.currentSpeech ? getSpeechName(timer.currentSpeech) : null;
    const currentSpeakerSide = timer.currentSpeech ? getSpeechSide(timer.currentSpeech) : null;

    // Get my side from room participants
    const myParticipant = room?.participants.find(p => p.id === myParticipantId);
    const mySide = myParticipant?.side || null;
    const opponentSide = mySide === 'AFF' ? 'NEG' : mySide === 'NEG' ? 'AFF' : null;

    // Check if it's my turn
    const isMyTurn = mySide !== null && currentSpeakerSide === mySide;

    // Prep times
    const myPrepTime = mySide ? timer.prepTime[mySide] : 0;
    const opponentPrepTime = opponentSide ? timer.prepTime[opponentSide] : 0;

    // Next speech - use pendingNextSpeech from store if available (set when speech:end received),
    // otherwise calculate from current speech
    const nextSpeech = pendingNextSpeech ?? (timer.currentSpeech ? getNextSpeech(timer.currentSpeech) : null);

    return {
      displayTime,
      isLowTime,
      isCriticalTime,
      currentSpeechName,
      currentSpeakerSide,
      isMyTurn,
      myPrepTime,
      opponentPrepTime,
      mySide,
      opponentSide,
      nextSpeech,
    };
  }, [timer, room, myParticipantId, pendingNextSpeech]);

  return {
    timer,
    ...derived,
    formatTime,
    getSpeechName,
    getSpeechSide,
  };
}
