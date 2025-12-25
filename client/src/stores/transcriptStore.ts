/**
 * Transcript Store
 * 
 * Manages real-time transcripts from STT service with translations.
 */

import { create } from 'zustand';
import type { SpeechRole, LanguageCode } from '@shared/types';

export interface Translation {
  text: string;
  language: LanguageCode;
  latencyMs: number;
}

export interface Transcript {
  id: string;
  speakerId: string;
  speakerName: string;
  speechId: SpeechRole;
  text: string;
  language: LanguageCode;
  confidence: number;
  timestamp: number;
  // Translation (added when translation arrives)
  translation?: Translation;
}

interface TranscriptState {
  transcripts: Transcript[];
  
  // Actions
  addTranscript: (transcript: Omit<Transcript, 'id' | 'timestamp'>) => string;
  addTranslation: (originalText: string, speakerId: string, translation: Translation) => void;
  clearTranscripts: () => void;
  getTranscriptsBySpeech: (speechId: SpeechRole) => Transcript[];
}

export const useTranscriptStore = create<TranscriptState>((set, get) => ({
  transcripts: [],

  addTranscript: (transcript) => {
    const id = `${transcript.speechId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newTranscript: Transcript = {
      ...transcript,
      id,
      timestamp: Date.now(),
    };

    set((state) => ({
      transcripts: [...state.transcripts, newTranscript],
    }));

    return id;
  },

  addTranslation: (originalText, speakerId, translation) => {
    set((state) => ({
      transcripts: state.transcripts.map((t) => {
        // Match by original text and speaker (most recent match)
        if (t.speakerId === speakerId && t.text === originalText && !t.translation) {
          return { ...t, translation };
        }
        return t;
      }),
    }));
  },

  clearTranscripts: () => {
    set({ transcripts: [] });
  },

  getTranscriptsBySpeech: (speechId) => {
    return get().transcripts.filter((t) => t.speechId === speechId);
  },
}));

