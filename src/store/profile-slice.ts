import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '@/store/store';

export interface TravelPreferences {
  budget?: string;
  pace?: string;
  dietary?: string;
}

export interface ProfileState {
  isHydrated: boolean;
  name: string | null;
  city: string | null;
  country: string | null;
  occupation: string | null;
  bio: string | null;
  languages: string[];
  interests: string[];
  travelPreferences: TravelPreferences;
  image: string | null;
}

const initialState: ProfileState = {
  isHydrated: false,
  name: null,
  city: null,
  country: null,
  occupation: null,
  bio: null,
  languages: [],
  interests: [],
  travelPreferences: {},
  image: null,
};

export const profileSlice = createSlice({
  name: 'profile',
  initialState,
  reducers: {
    setProfile(_state, action: PayloadAction<Partial<ProfileState>>) {
      return {
        ...initialState,
        ...action.payload,
        isHydrated: true,
      };
    },
    updateIdentity(state, action: PayloadAction<{
      name?: string;
      city?: string;
      country?: string;
      occupation?: string;
    }>) {
      const { name, city, country, occupation } = action.payload;
      if (name !== undefined) state.name = name;
      if (city !== undefined) state.city = city;
      if (country !== undefined) state.country = country;
      if (occupation !== undefined) state.occupation = occupation;
    },
    updateInterests(state, action: PayloadAction<string[]>) {
      state.interests = action.payload;
    },
    removeInterest(state, action: PayloadAction<string>) {
      state.interests = state.interests.filter((i) => i !== action.payload);
    },
    updateLanguages(state, action: PayloadAction<string[]>) {
      state.languages = action.payload;
    },
    removeLanguage(state, action: PayloadAction<string>) {
      state.languages = state.languages.filter((l) => l !== action.payload);
    },
    updatePreferences(state, action: PayloadAction<TravelPreferences>) {
      state.travelPreferences = {
        ...state.travelPreferences,
        ...action.payload,
      };
    },
    updateBio(state, action: PayloadAction<string>) {
      state.bio = action.payload;
    },
    updateImage(state, action: PayloadAction<string | null>) {
      state.image = action.payload;
    },
    resetProfile() {
      return initialState;
    },
  },
});

export const {
  setProfile,
  updateIdentity,
  updateInterests,
  removeInterest,
  updateLanguages,
  removeLanguage,
  updatePreferences,
  updateBio,
  updateImage,
  resetProfile,
} = profileSlice.actions;

export const selectProfile = (state: RootState) => state.profile;

export default profileSlice.reducer;
