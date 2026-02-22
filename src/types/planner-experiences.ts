export type PlannerExperience = {
  id: string;
  title: string;
  description: string;
  category: string;
  duration: number;
  price: number;
  rating: number;
  reviewCount: number;
  photos: string[];
  city: string;
  country: string;
  stops?: PlannerExperienceStop[];
};

export type PlannerExperienceStop = {
  id: string;
  name: string;
  description?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  order: number;
};

export type PlannerExperienceHost = {
  id: string;
  name: string;
  photo?: string | null;
  bio?: string | null;
  quote?: string | null;
  responseTime?: string | null;
  languages: string[];
  interests: string[];
  city?: string | null;
  country?: string | null;
  marker: {
    lat: number;
    lng: number;
  };
  experiences: PlannerExperience[];
};

export type PlannerExperiencesResponse = {
  city: string;
  hosts: PlannerExperienceHost[];
};
