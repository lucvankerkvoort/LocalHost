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
  | 'food-drink'
  | 'arts-culture'
  | 'outdoor-adventure'
  | 'wellness'
  | 'learning'
  | 'nightlife-social'
  | 'family';

export const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  'food-drink': 'Food & Drink',
  'arts-culture': 'Arts & Culture',
  'outdoor-adventure': 'Outdoor & Adventure',
  'wellness': 'Wellness',
  'learning': 'Learning',
  'nightlife-social': 'Nightlife & Social',
  'family': 'Family',
};

export const CATEGORY_ICONS: Record<ExperienceCategory, string> = {
  'food-drink': '🍽️',
  'arts-culture': '🎨',
  'outdoor-adventure': '🏔️',
  'wellness': '🧘',
  'learning': '📚',
  'nightlife-social': '🌃',
  'family': '👨‍👩‍👧‍👦',
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
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed';

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'refunded'
  | 'failed';

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
