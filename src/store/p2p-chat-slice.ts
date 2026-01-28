
import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { RootState } from './store';

// Types mirroring Prisma schema where possible
export type SenderType = 'USER' | 'HOST';

export interface ChatMessage {
  id: string;
  senderType: SenderType;
  content: string;
  createdAt: string; // ISO string for serializability
  isRead: boolean;
}

export interface ChatThread {
  hostId: string; // acts as the unique key for now
  hostName: string;
  hostPhoto: string;
  messages: ChatMessage[];
  unreadCount: number;
  lastMessageAt: string;
}

interface P2PChatState {
  threads: Record<string, ChatThread>; // Keyed by hostId
}

const initialState: P2PChatState = {
  threads: {},
};

export const p2pChatSlice = createSlice({
  name: 'p2pChat',
  initialState,
  reducers: {
    // Initialize a thread (e.g. when opening chat with a host)
    initThread: (state, action: PayloadAction<{ hostId: string; hostName: string; hostPhoto: string }>) => {
      const { hostId, hostName, hostPhoto } = action.payload;
      if (!state.threads[hostId]) {
        state.threads[hostId] = {
          hostId,
          hostName,
          hostPhoto,
          messages: [],
          unreadCount: 0,
          lastMessageAt: new Date().toISOString(),
        };
      }
    },
    
    sendMessage: (state, action: PayloadAction<{ hostId: string; content: string }>) => {
      const { hostId, content } = action.payload;
      const thread = state.threads[hostId];
      if (thread) {
        const newMessage: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          senderType: 'USER',
          content,
          createdAt: new Date().toISOString(),
          isRead: true,
        };
        thread.messages.push(newMessage);
        thread.lastMessageAt = newMessage.createdAt;
      }
    },

    receiveMessage: (state, action: PayloadAction<{ hostId: string; content: string }>) => {
      const { hostId, content } = action.payload;
      const thread = state.threads[hostId];
      if (thread) {
        const newMessage: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

    markThreadAsRead: (state, action: PayloadAction<{ hostId: string }>) => {
      const thread = state.threads[action.payload.hostId];
      if (thread) {
        thread.unreadCount = 0;
        thread.messages.forEach(msg => {
            if (msg.senderType === 'HOST') msg.isRead = true;
        });
      }
    }
  },
});

export const { initThread, sendMessage, receiveMessage, markThreadAsRead } = p2pChatSlice.actions;

// Selectors
// Selectors
export const selectP2PChatState = (state: RootState) => state.p2pChat;

export const selectAllThreads = createSelector(
  [selectP2PChatState],
  (p2pChat) => Object.values(p2pChat.threads).sort((a, b) => 
    new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  )
);

export const selectThreadByHostId = (state: RootState, hostId: string | null) => 
    hostId ? state.p2pChat.threads[hostId] : undefined;

export const selectTotalUnreadCount = (state: RootState) => 
    Object.values(state.p2pChat.threads).reduce((acc, thread) => acc + thread.unreadCount, 0);

export default p2pChatSlice.reducer;
