import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ToolCallSource = 'chat' | 'orchestrator' | 'system';

export type ToolCallEvent = {
  id: string;
  toolName: string;
  state: 'call' | 'result' | 'error' | 'unknown';
  params?: unknown;
  result?: unknown;
  success?: boolean;
  source: ToolCallSource;
  timestamp: number;
};

interface ToolCallsState {
  events: ToolCallEvent[];
  latestByTool: Record<string, ToolCallEvent>;
  lastResultsByTool: Record<string, ToolCallEvent>;
  pendingNavigation: { url: string; toolId: string } | null;
}

const initialState: ToolCallsState = {
  events: [],
  latestByTool: {},
  lastResultsByTool: {},
  pendingNavigation: null,
};

function inferSuccess(result: unknown, fallback?: boolean) {
  if (result && typeof result === 'object' && 'success' in result) {
    const value = (result as { success: unknown }).success;
    if (typeof value === 'boolean') return value;
  }
  return fallback;
}

const toolCallsSlice = createSlice({
  name: 'toolCalls',
  initialState,
  reducers: {
    toolCallReceived: {
      reducer(state, action: PayloadAction<ToolCallEvent>) {
        state.events.push(action.payload);
        state.latestByTool[action.payload.toolName] = action.payload;

        if (action.payload.state === 'result') {
          state.lastResultsByTool[action.payload.toolName] = action.payload;
        }

        if (
          action.payload.toolName === 'navigate' &&
          action.payload.state === 'result' &&
          action.payload.result &&
          typeof (action.payload.result as { url?: unknown }).url === 'string'
        ) {
          state.pendingNavigation = {
            url: (action.payload.result as { url: string }).url,
            toolId: action.payload.id,
          };
        }

        if (state.events.length > 200) {
          state.events.shift();
        }
      },
      prepare(payload: Omit<ToolCallEvent, 'id' | 'timestamp'> & { timestamp?: number }) {
        const timestamp = payload.timestamp ?? Date.now();
        return {
          payload: {
            ...payload,
            id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp,
            success: inferSuccess(payload.result, payload.success),
          },
        };
      },
    },
    navigationHandled(state, action: PayloadAction<string>) {
      if (state.pendingNavigation?.toolId === action.payload) {
        state.pendingNavigation = null;
      }
    },
    clearToolEvents(state) {
      state.events = [];
      state.latestByTool = {};
      state.lastResultsByTool = {};
      state.pendingNavigation = null;
    },
  },
});

export const { toolCallReceived, navigationHandled, clearToolEvents } = toolCallsSlice.actions;

export default toolCallsSlice.reducer;
