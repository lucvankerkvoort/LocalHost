import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from './store';

interface UIState {
  isP2PChatOpen: boolean;
  contactHostId: string | null;
  contactExperienceId: string | null;
  showTimeline: boolean;
}

const initialState: UIState = {
  isP2PChatOpen: false,
  contactHostId: null,
  contactExperienceId: null,
  showTimeline: true,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setP2PChatOpen: (state, action: PayloadAction<boolean>) => {
      state.isP2PChatOpen = action.payload;
    },
    openContactHost: (state, action: PayloadAction<{ hostId: string; experienceId?: string }>) => {
      state.contactHostId = action.payload.hostId;
      state.contactExperienceId = action.payload.experienceId || null;
    },
    closeContactHost: (state) => {
      state.contactHostId = null;
      state.contactExperienceId = null;
    },
    setShowTimeline: (state, action: PayloadAction<boolean>) => {
      state.showTimeline = action.payload;
    },
    toggleTimeline: (state) => {
      state.showTimeline = !state.showTimeline;
    }
  },
});

export const { 
  setP2PChatOpen, 
  openContactHost, 
  closeContactHost,
  setShowTimeline,
  toggleTimeline
} = uiSlice.actions;

export const selectUI = (state: RootState) => state.ui;

export default uiSlice.reducer;
