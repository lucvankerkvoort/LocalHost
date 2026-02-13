import type { ExperienceCategory } from '@/types';

export interface Host {
  id: string;
  name: string;
  photo: string;
  city: string;
  country: string;
  bio: string;
  quote: string;
  interests: string[];
  languages: string[];
  responseTime: string;
  memberSince: string;
  experiences: HostExperience[];
}

export interface HostExperience {
  id: string;
  title: string;
  description: string;
  category: ExperienceCategory;
  duration: number; // minutes
  price: number; // cents
  rating: number;
  reviewCount: number;
  photos: string[];
}

// Rich host profiles - these are the core entity now
const CURATED_HOSTS: Host[] = [
  {
    id: 'maria-rome',
    name: 'Maria Rossi',
    photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&crop=face',
    city: 'Rome',
    country: 'Italy',
    bio: "I'm a third-generation cook who learned everything from my grandmother in our family kitchen. After 20 years in the restaurant business, I now share what I love most—teaching travelers how to make real Italian food, the way my nonna taught me.",
    quote: "Food is love made visible. Come cook with me and leave as family.",
    interests: ['cooking', 'wine', 'history', 'family traditions', 'farmers markets'],
    languages: ['Italian', 'English', 'Spanish'],
    responseTime: 'within an hour',
    memberSince: '2022',
    experiences: [
      {
        id: '1',
        title: 'Sunset Cooking Class with Nonna Maria',
        description: 'Learn authentic Roman pasta recipes in my family home, using fresh ingredients from the local market.',
        category: 'FOOD_DRINK',
        duration: 180,
        price: 7500,
        rating: 4.9,
        reviewCount: 127,
        photos: ['https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=600&h=400&fit=crop'],
      },
      {
        id: '1b',
        title: 'Morning Market Tour & Brunch',
        description: 'Explore Campo de\' Fiori market with me, pick fresh ingredients, and cook brunch together.',
        category: 'FOOD_DRINK',
        duration: 150,
        price: 6000,
        rating: 4.8,
        reviewCount: 43,
        photos: ['https://images.unsplash.com/photo-1534531173927-aeb928d54385?w=600&h=400&fit=crop'],
      },
    ],
  },
  {
    id: 'carlos-cdmx',
    name: 'Carlos Mendez',
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
    city: 'Mexico City',
    country: 'Mexico',
    bio: "Street artist and urban explorer. I've spent 15 years discovering the hidden corners of CDMX—the murals, the markets, the mezcal bars that tourists never find. I love showing people the real city, the one that locals know.",
    quote: "The best art isn't in museums. It's on the streets, if you know where to look.",
    interests: ['street art', 'urban exploration', 'photography', 'mezcal', 'live music'],
    languages: ['Spanish', 'English'],
    responseTime: 'within a few hours',
    memberSince: '2023',
    experiences: [
      {
        id: '2',
        title: 'Hidden Murals Walking Tour',
        description: 'Discover street art gems and learn the stories behind them in vibrant neighborhoods.',
        category: 'ARTS_CULTURE',
        duration: 150,
        price: 3500,
        rating: 4.8,
        reviewCount: 89,
        photos: ['https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=600&h=400&fit=crop'],
      },
      {
        id: '2b',
        title: 'Mezcal & Markets After Dark',
        description: 'Hit the best local mezcal bars and late-night taco spots that only locals know.',
        category: 'NIGHTLIFE_SOCIAL',
        duration: 180,
        price: 5000,
        rating: 4.9,
        reviewCount: 56,
        photos: ['https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=400&fit=crop'],
      },
    ],
  },
  {
    id: 'yuki-kyoto',
    name: 'Yuki Tanaka',
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&crop=face',
    city: 'Kyoto',
    country: 'Japan',
    bio: "Former temple guide turned outdoor enthusiast. I grew up hiking the mountains around Kyoto and practicing meditation at dawn. Now I help travelers experience the peaceful side of Japan—away from the crowds, in nature.",
    quote: "The best moments happen when you slow down. Let me show you the quiet Kyoto.",
    interests: ['hiking', 'meditation', 'tea ceremony', 'nature', 'photography', 'Buddhism'],
    languages: ['Japanese', 'English'],
    responseTime: 'within a day',
    memberSince: '2021',
    experiences: [
      {
        id: '3',
        title: 'Mountain Sunrise Hike & Breakfast',
        description: 'Early morning trek to a secret viewpoint, followed by traditional Japanese breakfast.',
        category: 'OUTDOOR_ADVENTURE',
        duration: 240,
        price: 5000,
        rating: 5.0,
        reviewCount: 64,
        photos: ['https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&h=400&fit=crop'],
      },
      {
        id: '3b',
        title: 'Zen Garden Meditation Walk',
        description: 'Visit hidden temple gardens and learn meditation techniques passed down for centuries.',
        category: 'WELLNESS',
        duration: 120,
        price: 4000,
        rating: 4.9,
        reviewCount: 38,
        photos: ['https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=600&h=400&fit=crop'],
      },
    ],
  },
  {
    id: 'amara-barcelona',
    name: 'Amara Delgado',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop&crop=face',
    city: 'Barcelona',
    country: 'Spain',
    bio: "Born and raised in El Born. By day I'm a sommelier, by night I'm your guide to Barcelona's best-kept secrets. I know every hidden courtyard, rooftop bar, and late-night tapas spot in this city.",
    quote: "Barcelona is best experienced at midnight. Let me show you why.",
    interests: ['wine', 'tapas', 'architecture', 'nightlife', 'flamenco', 'design'],
    languages: ['Spanish', 'Catalan', 'English', 'French'],
    responseTime: 'within a few hours',
    memberSince: '2022',
    experiences: [
      {
        id: '4',
        title: 'Secret Wine Bars & Tapas Trail',
        description: 'Skip the tourist traps. I\'ll take you to 4 authentic spots where locals actually go.',
        category: 'FOOD_DRINK',
        duration: 180,
        price: 8500,
        rating: 4.9,
        reviewCount: 112,
        photos: ['https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=400&fit=crop'],
      },
    ],
  },
  {
    id: 'kofi-accra',
    name: 'Kofi Asante',
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=face',
    city: 'Accra',
    country: 'Ghana',
    bio: "Entrepreneur, drummer, storyteller. I run a small textile business in Jamestown but my real passion is showing people the rhythm of Accra—the music, the art, the energy. Ghana is rising, and I want you to feel it.",
    quote: "Akwaaba! Welcome. Let's make some memories and maybe learn some drums.",
    interests: ['drumming', 'textiles', 'local business', 'Afrobeats', 'storytelling', 'beach'],
    languages: ['English', 'Twi', 'Ga'],
    responseTime: 'within a few hours',
    memberSince: '2023',
    experiences: [
      {
        id: '5',
        title: 'Jamestown Rhythm & Culture Walk',
        description: 'Explore the historic Jamestown neighborhood, meet local artisans, and try African drumming.',
        category: 'ARTS_CULTURE',
        duration: 180,
        price: 4000,
        rating: 4.8,
        reviewCount: 34,
        photos: ['https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&h=400&fit=crop'],
      },
      {
        id: '5b',
        title: 'Beach Bonfire & Live Music Night',
        description: 'End your day Ghanaian style—bonfire on the beach with local musicians and cold drinks.',
        category: 'NIGHTLIFE_SOCIAL',
        duration: 180,
        price: 3500,
        rating: 5.0,
        reviewCount: 28,
        photos: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop'],
      },
    ],
  },
  {
    id: 'sofia-lisbon',
    name: 'Sofia Ferreira',
    photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop&crop=face',
    city: 'Lisbon',
    country: 'Portugal',
    bio: "Tile artist and history nerd. I've spent years studying the azulejos (tiles) that cover Lisbon's buildings. Walking through this city with me is like reading a 500-year-old story written on walls.",
    quote: "Every tile tells a story. Let me translate Lisbon for you.",
    interests: ['tile art', 'history', 'architecture', 'fado music', 'pastéis de nata', 'vintage shops'],
    languages: ['Portuguese', 'English', 'French'],
    responseTime: 'within a day',
    memberSince: '2021',
    experiences: [
      {
        id: '6',
        title: 'Azulejo Art & History Walk',
        description: 'Discover the stories hidden in Lisbon\'s iconic blue tiles, from medieval to modern.',
        category: 'ARTS_CULTURE',
        duration: 150,
        price: 4500,
        rating: 4.9,
        reviewCount: 87,
        photos: ['https://images.unsplash.com/photo-1548707309-dcebeab9ea9b?w=600&h=400&fit=crop'],
      },
    ],
  },
];

// Import generated hosts and merge with curated ones
import generatedHostsRaw from './generated-hosts.json';

type LegacyExperience = Omit<HostExperience, 'category' | 'photos'> & {
  category: string;
  photo?: string;
  photos?: unknown;
};

type LegacyHost = Omit<Host, 'experiences'> & {
  experiences: LegacyExperience[];
};

// Adapter to convert legacy generated hosts to new schema
const generatedHostsRawData: unknown = generatedHostsRaw;
const generatedHosts: Host[] = Array.isArray(generatedHostsRawData)
  ? (generatedHostsRawData as LegacyHost[]).map((host) => ({
      ...host,
      // Ensure category is uppercase (basic mapping, assumes valid enum string exists)
      experiences: host.experiences.map((exp) => ({
        ...exp,
        // Map category to uppercase, handling kebab-case to SNAKE_CASE if needed
        category: exp.category.toUpperCase().replace(/-/g, '_') as ExperienceCategory,
        // Map single photo to photos array, filtering out undefined values
        photos: [
          ...(typeof exp.photo === 'string' ? [exp.photo] : []),
          ...(Array.isArray(exp.photos) ? exp.photos : []),
        ].filter((p): p is string => typeof p === 'string' && p.length > 0),
      })),
    }))
  : [];

export const HOSTS: Host[] = [...CURATED_HOSTS, ...generatedHosts];

// Helper function to get a host by ID
export function getHostById(id: string): Host | undefined {
  return HOSTS.find(host => host.id === id);
}

// Helper function to get hosts by city
export function getHostsByCity(city: string): Host[] {
  return HOSTS.filter(host => host.city.toLowerCase() === city.toLowerCase());
}

// Helper function to get hosts by interests (returns hosts with at least one matching interest)
export function getHostsByInterests(interests: string[]): Host[] {
  const lowerInterests = interests.map(i => i.toLowerCase());
  return HOSTS.filter(host => 
    host.interests.some(hostInterest => 
      lowerInterests.some(interest => 
        hostInterest.toLowerCase().includes(interest) || 
        interest.includes(hostInterest.toLowerCase())
      )
    )
  ).sort((a, b) => {
    // Sort by number of matching interests
    const aMatches = a.interests.filter(i => 
      lowerInterests.some(interest => i.toLowerCase().includes(interest) || interest.includes(i.toLowerCase()))
    ).length;
    const bMatches = b.interests.filter(i => 
      lowerInterests.some(interest => i.toLowerCase().includes(interest) || interest.includes(i.toLowerCase()))
    ).length;
    return bMatches - aMatches;
  });
}

// Get all unique cities
export function getAllCities(): string[] {
  return [...new Set(HOSTS.map(host => host.city))];
}
