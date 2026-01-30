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
    reorderStops: (state, action: PayloadAction<{ id: string; newOrder: number }[]>) => {
      // Logic would be here
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

export const { setCity, addStop, removeStop, updateDraft, setDraft, resetDraft } = hostCreationSlice.actions;

export const selectHostCreation = (state: RootState) => state.hostCreation;

export default hostCreationSlice.reducer;
