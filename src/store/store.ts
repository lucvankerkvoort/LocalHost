import { configureStore } from '@reduxjs/toolkit';

import globeReducer from './globe-slice';
import toolCallsReducer from './tool-calls-slice';
import orchestratorReducer from './orchestrator-slice';
import hostsReducer from './hosts-slice';
import hostCreationReducer from './host-creation-slice';
import uiReducer from './ui-slice';

export const store = configureStore({
  reducer: {
    globe: globeReducer,
    toolCalls: toolCallsReducer,
    orchestrator: orchestratorReducer,
    hosts: hostsReducer,
    hostCreation: hostCreationReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

