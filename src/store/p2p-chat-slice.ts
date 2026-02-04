import { createSlice, PayloadAction, createSelector, createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from './store';

// Types mirroring Prisma schema where possible
export type SenderType = 'USER' | 'HOST';

export interface ChatMessage {
  id: string;
  senderType: SenderType;
  content: string;
  createdAt: string; // ISO string for serializability
  isRead: boolean;
  sender?: { name: string; image?: string };
}

export interface ChatThread {
  bookingId: string; // Unique key needed for persistence
  hostId: string; 
  hostName: string;
  hostPhoto: string;
  messages: ChatMessage[];
  unreadCount: number;
  lastMessageAt: string;
  isLoading: boolean;
}

interface ApiBookingMessage {
  id: string;
  senderId?: string;
  content: string;
  createdAt: string;
  isRead: boolean;
}

interface P2PChatState {
  threads: Record<string, ChatThread>; // Keyed by bookingId
  activeBookingId: string | null;
}

const initialState: P2PChatState = {
  threads: {},
  activeBookingId: null,
};

// Async Thunks
export const fetchMessages = createAsyncThunk(
  'p2pChat/fetchMessages',
  async (bookingId: string) => {
    const res = await fetch(`/api/bookings/${bookingId}/messages`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    return await res.json();
  }
);

export const sendChatMessage = createAsyncThunk(
  'p2pChat/sendChatMessage',
  async ({ bookingId, content }: { bookingId: string; content: string }) => {
    const res = await fetch(`/api/bookings/${bookingId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return await res.json();
  }
);

export const p2pChatSlice = createSlice({
  name: 'p2pChat',
  initialState,
  reducers: {
    // Initialize a thread (locally, e.g. when confirming booking)
    initThread: (state, action: PayloadAction<{ bookingId: string; hostId: string; hostName: string; hostPhoto: string }>) => {
      const { bookingId, hostId, hostName, hostPhoto } = action.payload;
      if (!state.threads[bookingId]) {
        state.threads[bookingId] = {
          bookingId,
          hostId,
          hostName,
          hostPhoto,
          messages: [],
          unreadCount: 0,
          lastMessageAt: new Date().toISOString(),
          isLoading: false,
        };
      }
      state.activeBookingId = bookingId;
    },
    
    setActiveBookingId: (state, action: PayloadAction<string | null>) => {
        state.activeBookingId = action.payload;
    },

    receiveMessage: (state, action: PayloadAction<{ bookingId: string; content: string }>) => {
      const { bookingId, content } = action.payload;
      const thread = state.threads[bookingId];
      if (thread) {
        const newMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          senderType: 'HOST',
          content,
          createdAt: new Date().toISOString(),
          isRead: false,
        };
        thread.messages.push(newMessage);
        thread.unreadCount += 1;
        thread.lastMessageAt = newMessage.createdAt;
      }
    },

    markThreadAsRead: (state, action: PayloadAction<{ bookingId: string }>) => {
      const thread = state.threads[action.payload.bookingId];
      if (thread) {
        thread.unreadCount = 0;
        thread.messages.forEach(msg => {
            if (msg.senderType === 'HOST') msg.isRead = true;
        });
      }
    }
  },
  extraReducers: (builder) => {
    builder.addCase(fetchMessages.fulfilled, (state, action) => {
        const bookingId = action.meta.arg;
        const messages = action.payload as ApiBookingMessage[];
        if (state.threads[bookingId]) {
            const hostId = state.threads[bookingId].hostId;
            state.threads[bookingId].messages = messages.map((msg) => ({
                id: msg.id,
                content: msg.content,
                createdAt: msg.createdAt,
                isRead: msg.isRead,
                senderType: msg.senderId === hostId ? 'HOST' : 'USER',
            }));
        }
    });
    builder.addCase(sendChatMessage.fulfilled, (state, action) => {
        const bookingId = action.meta.arg.bookingId;
        const msg = action.payload;
        if (state.threads[bookingId]) {
            // Check if msg already optimistically added? Or just push.
            // Simplified: just push.
            state.threads[bookingId].messages.push({
                id: msg.id,
                senderType: 'USER',
                content: msg.content,
                createdAt: msg.createdAt,
                isRead: true
            });
            state.threads[bookingId].lastMessageAt = msg.createdAt;
        }
    });
  }
});

export const { initThread, setActiveBookingId, receiveMessage, markThreadAsRead } = p2pChatSlice.actions;

// Selectors
export const selectP2PChatState = (state: RootState) => state.p2pChat;

export const selectAllThreads = createSelector(
  [selectP2PChatState],
  (p2pChat) => Object.values(p2pChat.threads).sort((a, b) => 
    new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  )
);

export const selectActiveThread = (state: RootState) => 
    state.p2pChat.activeBookingId ? state.p2pChat.threads[state.p2pChat.activeBookingId] : null;

export const selectTotalUnreadCount = (state: RootState) => 
    Object.values(state.p2pChat.threads).reduce((acc, thread) => acc + thread.unreadCount, 0);

export default p2pChatSlice.reducer;
