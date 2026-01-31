import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '@/store/store';

export interface HostCreationStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  order: number;
}

export interface HostCreationState {
  city: string | null;
  cityLat: number | null;
  cityLng: number | null;
  stops: HostCreationStop[];
  title: string | null;
  shortDesc: string | null;
  longDesc: string | null;
  duration: number | null; // min
  status: 'draft' | 'synthesizing' | 'review' | 'published';
}

const initialState: HostCreationState = {
  city: null,
  cityLat: null,
  cityLng: null,
  stops: [],
  title: null,
  shortDesc: null,
  longDesc: null,
  duration: null,
  status: 'draft',
};

export const hostCreationSlice = createSlice({
  name: 'hostCreation',
  initialState,
  reducers: {
    setCity: (state, action: PayloadAction<{ name: string; lat: number; lng: number }>) => {
      state.city = action.payload.name;
      state.cityLat = action.payload.lat;
      state.cityLng = action.payload.lng;
    },
    addStop: (state, action: PayloadAction<HostCreationStop>) => {
      state.stops.push(action.payload);
    },
    removeStop: (state, action: PayloadAction<string>) => {
      state.stops = state.stops.filter((s) => s.id !== action.payload);
    },
    updateStop: (state, action: PayloadAction<{ id: string; changes: Partial<HostCreationStop> }>) => {
      const stop = state.stops.find((s) => s.id === action.payload.id);
      if (stop) {
        Object.assign(stop, action.payload.changes);
      }
    },
    reorderStop: (state, action: PayloadAction<{ id: string; direction: 'up' | 'down' }>) => {
      const index = state.stops.findIndex((s) => s.id === action.payload.id);
      if (index === -1) return;

      const newIndex = action.payload.direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= state.stops.length) return;

      const stop = state.stops[index];
      state.stops.splice(index, 1);
      state.stops.splice(newIndex, 0, stop);
      
      // Update order property
      state.stops.forEach((s, i) => {
        s.order = i + 1;
      });
    },
    moveStop: (state, action: PayloadAction<{ activeId: string; overId: string }>) => {
      const oldIndex = state.stops.findIndex((s) => s.id === action.payload.activeId);
      const newIndex = state.stops.findIndex((s) => s.id === action.payload.overId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const stop = state.stops[oldIndex];
        state.stops.splice(oldIndex, 1);
        state.stops.splice(newIndex, 0, stop);
        
        // Update order property
        state.stops.forEach((s, i) => {
          s.order = i + 1;
        });
      }
    },
    updateDraft: (state, action: PayloadAction<Partial<HostCreationState>>) => {
      Object.assign(state, action.payload);
    },
    setDraft: (state, action: PayloadAction<Partial<HostCreationState>>) => {
      return { ...initialState, ...action.payload };
    },
    resetDraft: () => initialState,
  },
});

export const { setCity, addStop, removeStop, updateStop, reorderStop, moveStop, updateDraft, setDraft, resetDraft } = hostCreationSlice.actions;

export const selectHostCreation = (state: RootState) => state.hostCreation;

export default hostCreationSlice.reducer;
