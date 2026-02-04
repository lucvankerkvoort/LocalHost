import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from './store';

export type ItineraryPanelTab = 'ITINERARY' | 'EXPERIENCES';

interface UIState {
  isP2PChatOpen: boolean;
  contactHostId: string | null;
  contactExperienceId: string | null;
  showTimeline: boolean;
  isListSurfaceOpen: boolean;
  isItineraryCollapsed: boolean;
  itineraryPanelTab: ItineraryPanelTab;
}

const initialState: UIState = {
  isP2PChatOpen: false,
  contactHostId: null,
  contactExperienceId: null,
  showTimeline: true,
  isListSurfaceOpen: false,
  isItineraryCollapsed: false,
  itineraryPanelTab: 'ITINERARY',
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
    },
    setListSurfaceOpen: (state, action: PayloadAction<boolean>) => {
      state.isListSurfaceOpen = action.payload;
    },
    toggleListSurface: (state) => {
      state.isListSurfaceOpen = !state.isListSurfaceOpen;
    },
    setItineraryCollapsed: (state, action: PayloadAction<boolean>) => {
      state.isItineraryCollapsed = action.payload;
    },
    toggleItineraryCollapsed: (state) => {
      state.isItineraryCollapsed = !state.isItineraryCollapsed;
    },
    setItineraryPanelTab: (state, action: PayloadAction<ItineraryPanelTab>) => {
      state.itineraryPanelTab = action.payload;
    },
    toggleItineraryPanelTab: (state) => {
      state.itineraryPanelTab =
        state.itineraryPanelTab === 'ITINERARY' ? 'EXPERIENCES' : 'ITINERARY';
    },
  },
});

export const { 
  setP2PChatOpen, 
  openContactHost, 
  closeContactHost,
  setShowTimeline,
  toggleTimeline,
  setListSurfaceOpen,
  toggleListSurface,
  setItineraryCollapsed,
  toggleItineraryCollapsed,
  setItineraryPanelTab,
  toggleItineraryPanelTab,
} = uiSlice.actions;

export const selectUI = (state: RootState) => state.ui;

export default uiSlice.reducer;
