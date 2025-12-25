import { create } from 'zustand';
import type {
  RoomState,
  Participant,
  TimerState,
  SpeechRole,
  BotCharacter,
  Side,
  LanguageCode,
} from '@shared/types';

// Bot configuration for practice mode
interface BotConfig {
  character: BotCharacter;
  userSide: Side;
  resolution: string;
  language: LanguageCode;
}

interface RoomStore {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Room state
  room: RoomState | null;
  myParticipantId: string | null;

  // Timer state
  timer: TimerState | null;
  pendingNextSpeech: SpeechRole | null;

  // Bot state (Milestone 5)
  botConfig: BotConfig | null;
  isBotGenerating: boolean;
  botSpeechText: string | null;

  // Actions
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setRoom: (room: RoomState | null) => void;
  setMyParticipantId: (id: string | null) => void;
  setTimer: (timer: TimerState | null) => void;
  setPendingNextSpeech: (speech: SpeechRole | null) => void;
  updateParticipant: (participantId: string, updates: Partial<Participant>) => void;
  setBotConfig: (config: BotConfig | null) => void;
  setBotGenerating: (generating: boolean) => void;
  setBotSpeechText: (text: string | null) => void;
  reset: () => void;

  // Derived getters
  getMyParticipant: () => Participant | null;
  getOpponent: () => Participant | null;
  isPracticeMode: () => boolean;
}

const initialState = {
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  room: null,
  myParticipantId: null,
  timer: null,
  pendingNextSpeech: null as SpeechRole | null,
  botConfig: null as BotConfig | null,
  isBotGenerating: false,
  botSpeechText: null as string | null,
};

export const useRoomStore = create<RoomStore>((set, get) => ({
  ...initialState,

  setConnected: (connected) => set({ isConnected: connected }),
  setConnecting: (connecting) => set({ isConnecting: connecting }),
  setConnectionError: (error) => set({ connectionError: error }),
  setRoom: (room) => set({ room }),
  setMyParticipantId: (id) => set({ myParticipantId: id }),
  setTimer: (timer) => set({ timer }),
  setPendingNextSpeech: (speech) => set({ pendingNextSpeech: speech }),
  setBotConfig: (config) => set({ botConfig: config }),
  setBotGenerating: (generating) => set({ isBotGenerating: generating }),
  setBotSpeechText: (text) => set({ botSpeechText: text }),

  updateParticipant: (participantId, updates) => {
    const { room } = get();
    if (!room) return;

    const updatedParticipants = room.participants.map((p) =>
      p.id === participantId ? { ...p, ...updates } : p
    );

    set({
      room: { ...room, participants: updatedParticipants },
    });
  },

  reset: () => set(initialState),

  getMyParticipant: () => {
    const { room, myParticipantId } = get();
    if (!room || !myParticipantId) return null;
    return room.participants.find((p) => p.id === myParticipantId) || null;
  },

  getOpponent: () => {
    const { room, myParticipantId } = get();
    if (!room || !myParticipantId) return null;
    return room.participants.find((p) => p.id !== myParticipantId) || null;
  },

  isPracticeMode: () => {
    const { room } = get();
    return room?.mode === 'practice';
  },
}));
