import { create } from 'zustand';
import type {
  RoomState,
  Participant,
  LanguageCode,
  Side,
  TimerState,
} from '@shared/types';

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

  // Actions
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setRoom: (room: RoomState | null) => void;
  setMyParticipantId: (id: string | null) => void;
  setTimer: (timer: TimerState | null) => void;
  updateParticipant: (participantId: string, updates: Partial<Participant>) => void;
  reset: () => void;

  // Derived getters
  getMyParticipant: () => Participant | null;
  getOpponent: () => Participant | null;
}

const initialState = {
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  room: null,
  myParticipantId: null,
  timer: null,
};

export const useRoomStore = create<RoomStore>((set, get) => ({
  ...initialState,

  setConnected: (connected) => set({ isConnected: connected }),
  setConnecting: (connecting) => set({ isConnecting: connecting }),
  setConnectionError: (error) => set({ connectionError: error }),
  setRoom: (room) => set({ room }),
  setMyParticipantId: (id) => set({ myParticipantId: id }),
  setTimer: (timer) => set({ timer }),

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
}));
