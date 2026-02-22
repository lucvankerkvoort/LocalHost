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
  sender?: { name?: string; image?: string };
}

export interface ChatThread {
  threadId: string;
  bookingId: string | null;
  hostId: string; 
  hostName: string;
  hostPhoto: string;
  messages: ChatMessage[];
  unreadCount: number;
  lastMessageAt: string;
  isLoading: boolean;
}

interface ApiThreadMessage {
  id: string;
  senderId?: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  sender?: {
    name: string | null;
    image: string | null;
  };
}

interface ApiThreadSummary {
  id: string;
  bookingId: string | null;
  counterpartId: string;
  counterpartName: string;
  counterpartPhoto: string;
  latestMessage?: ApiThreadMessage | null;
}

interface P2PChatState {
  threads: Record<string, ChatThread>; // Keyed by threadId
  activeThreadId: string | null;
}

const initialState: P2PChatState = {
  threads: {},
  activeThreadId: null,
};

// Async Thunks
export const fetchMessages = createAsyncThunk(
  'p2pChat/fetchMessages',
  async (threadId: string) => {
    const res = await fetch(`/api/chat/threads/${threadId}/messages`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    return await res.json();
  }
);

export const fetchChatThreads = createAsyncThunk(
  'p2pChat/fetchChatThreads',
  async () => {
    const res = await fetch('/api/chat/threads');
    if (!res.ok) throw new Error('Failed to fetch chat threads');
    const payload = (await res.json()) as { threads?: ApiThreadSummary[] };
    return Array.isArray(payload.threads) ? payload.threads : [];
  }
);

export const sendChatMessage = createAsyncThunk(
  'p2pChat/sendChatMessage',
  async ({ threadId, content }: { threadId: string; content: string }) => {
    const res = await fetch(`/api/chat/threads/${threadId}/messages`, {
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
    // Initialize a thread (locally, e.g. after opening contact host)
    initThread: (
      state,
      action: PayloadAction<{
        threadId: string;
        bookingId?: string | null;
        hostId: string;
        hostName: string;
        hostPhoto: string;
      }>
    ) => {
      const { threadId, bookingId = null, hostId, hostName, hostPhoto } = action.payload;
      if (!state.threads[threadId]) {
        state.threads[threadId] = {
          threadId,
          bookingId,
          hostId,
          hostName,
          hostPhoto,
          messages: [],
          unreadCount: 0,
          lastMessageAt: new Date().toISOString(),
          isLoading: false,
        };
      } else if (bookingId && !state.threads[threadId].bookingId) {
        state.threads[threadId].bookingId = bookingId;
      }
      state.activeThreadId = threadId;
    },
    
    setActiveThreadId: (state, action: PayloadAction<string | null>) => {
        state.activeThreadId = action.payload;
    },

    receiveMessage: (state, action: PayloadAction<{ threadId: string; content: string }>) => {
      const { threadId, content } = action.payload;
      const thread = state.threads[threadId];
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

    markThreadAsRead: (state, action: PayloadAction<{ threadId: string }>) => {
      const thread = state.threads[action.payload.threadId];
      if (thread) {
        thread.unreadCount = 0;
        thread.messages.forEach(msg => {
            if (msg.senderType === 'HOST') msg.isRead = true;
        });
      }
    }
  },
  extraReducers: (builder) => {
    builder.addCase(fetchChatThreads.fulfilled, (state, action) => {
      const fetched = action.payload as ApiThreadSummary[];

      for (const thread of fetched) {
        const existing = state.threads[thread.id];
        const seededMessages = thread.latestMessage
          ? [
              (() => {
                const sender = thread.latestMessage?.sender
                  ? {
                      name: thread.latestMessage.sender.name ?? undefined,
                      image: thread.latestMessage.sender.image ?? undefined,
                    }
                  : undefined;

                return {
                  id: thread.latestMessage.id,
                  content: thread.latestMessage.content,
                  createdAt: thread.latestMessage.createdAt,
                  isRead: thread.latestMessage.isRead,
                  senderType:
                    thread.latestMessage.senderId === thread.counterpartId ? 'HOST' : 'USER',
                  ...(sender ? { sender } : {}),
                } satisfies ChatMessage;
              })(),
            ]
          : [];

        state.threads[thread.id] = {
          threadId: thread.id,
          bookingId: thread.bookingId ?? null,
          hostId: thread.counterpartId,
          hostName: thread.counterpartName,
          hostPhoto: thread.counterpartPhoto,
          messages:
            existing && existing.messages.length > 0 ? existing.messages : seededMessages,
          unreadCount: existing?.unreadCount ?? 0,
          lastMessageAt:
            existing?.lastMessageAt ??
            thread.latestMessage?.createdAt ??
            new Date().toISOString(),
          isLoading: false,
        };
      }
    });
    builder.addCase(fetchMessages.fulfilled, (state, action) => {
        const threadId = action.meta.arg;
        const messages = action.payload as ApiThreadMessage[];
        if (state.threads[threadId]) {
            const hostId = state.threads[threadId].hostId;
            state.threads[threadId].messages = messages.map((msg) => {
                const sender = msg.sender
                  ? {
                      name: msg.sender.name ?? undefined,
                      image: msg.sender.image ?? undefined,
                    }
                  : undefined;

                return {
                  id: msg.id,
                  content: msg.content,
                  createdAt: msg.createdAt,
                  isRead: msg.isRead,
                  senderType: msg.senderId === hostId ? 'HOST' : 'USER',
                  ...(sender ? { sender } : {}),
                };
            });
        }
    });
    builder.addCase(sendChatMessage.fulfilled, (state, action) => {
        const threadId = action.meta.arg.threadId;
        const msg = action.payload;
        if (state.threads[threadId]) {
            // Check if msg already optimistically added? Or just push.
            // Simplified: just push.
            state.threads[threadId].messages.push({
                id: msg.id,
                senderType: 'USER',
                content: msg.content,
                createdAt: msg.createdAt,
                isRead: true
            });
            state.threads[threadId].lastMessageAt = msg.createdAt;
        }
    });
  }
});

export const { initThread, setActiveThreadId, receiveMessage, markThreadAsRead } = p2pChatSlice.actions;

// Selectors
export const selectP2PChatState = (state: RootState) => state.p2pChat;

export const selectAllThreads = createSelector(
  [selectP2PChatState],
  (p2pChat) => Object.values(p2pChat.threads).sort((a, b) => 
    new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  )
);

export const selectActiveThread = (state: RootState) => 
    state.p2pChat.activeThreadId ? state.p2pChat.threads[state.p2pChat.activeThreadId] : null;

export const selectTotalUnreadCount = (state: RootState) => 
    Object.values(state.p2pChat.threads).reduce((acc, thread) => acc + thread.unreadCount, 0);

export default p2pChatSlice.reducer;
