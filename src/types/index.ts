// Core type definitions for the Localhost platform

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  languages: string[];
  interests: string[];
  location?: {
    city: string;
    country: string;
  };
  isHost: boolean;
  isVerified: boolean;
  verificationTier: 'basic' | 'verified' | 'trusted';
  trustScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Experience {
  id: string;
  hostId: string;
  host?: User;
  title: string;
  description: string;
  category: ExperienceCategory;
  location: {
    neighborhood: string;
    city: string;
    country: string;
    // Exact address revealed after booking
    address?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  duration: number; // in minutes
  groupSize: {
    min: number;
    max: number;
  };
  price: number; // in cents
  currency: string;
  includedItems: string[];
  excludedItems: string[];
  photos: string[];
  rating: number;
  reviewCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ExperienceCategory =
  | 'FOOD_DRINK'
  | 'ARTS_CULTURE'
  | 'OUTDOOR_ADVENTURE'
  | 'WELLNESS'
  | 'LEARNING'
  | 'NIGHTLIFE_SOCIAL'
  | 'FAMILY';

export const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  'FOOD_DRINK': 'Food & Drink',
  'ARTS_CULTURE': 'Arts & Culture',
  'OUTDOOR_ADVENTURE': 'Outdoor & Adventure',
  'WELLNESS': 'Wellness',
  'LEARNING': 'Learning',
  'NIGHTLIFE_SOCIAL': 'Nightlife & Social',
  'FAMILY': 'Family',
};

export const CATEGORY_ICONS: Record<ExperienceCategory, string> = {
  'FOOD_DRINK': '🍽️',
  'ARTS_CULTURE': '🎨',
  'OUTDOOR_ADVENTURE': '🏔️',
  'WELLNESS': '🧘',
  'LEARNING': '📚',
  'NIGHTLIFE_SOCIAL': '🌃',
  'FAMILY': '👨‍👩‍👧‍👦',
};

export interface Booking {
  id: string;
  experienceId: string;
  experience?: Experience;
  guestId: string;
  guest?: User;
  date: Date;
  guestCount: number;
  totalPrice: number;
  currency: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type BookingStatus =
  | 'PENDING' // Keep pending if used by backward compat for a moment, but prefer TENTATIVE
  | 'TENTATIVE'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED';

export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'REFUNDED'
  | 'FAILED';

export interface Review {
  id: string;
  bookingId: string;
  reviewerId: string;
  reviewer?: User;
  revieweeId: string;
  reviewee?: User;
  experienceId: string;
  experience?: Experience;
  type: 'guest-to-host' | 'host-to-guest';
  rating: number; // 1-5
  content: string;
  createdAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender?: User;
  content: string;
  isRead: boolean;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  participants: User[];
  experienceId?: string;
  experience?: Experience;
  bookingId?: string;
  booking?: Booking;
  lastMessage?: Message;
  updatedAt: Date;
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Filter Types
export interface ExperienceFilters {
  category?: ExperienceCategory;
  city?: string;
  dateFrom?: Date;
  dateTo?: Date;
  priceMin?: number;
  priceMax?: number;
  groupSizeMin?: number;
  groupSizeMax?: number;
  language?: string;
  rating?: number;
}

export type SortOption =
  | 'relevance'
  | 'rating'
  | 'price-low'
  | 'price-high'
  | 'distance';
