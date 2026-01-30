import { HOSTS, type Host, type HostExperience } from './data/hosts';

// Category mappings for semantic understanding
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  'FOOD_DRINK': ['food', 'cooking', 'restaurant', 'cuisine', 'dining', 'eat', 'drink', 'wine', 'beer', 'coffee', 'culinary', 'chef', 'kitchen', 'taste', 'gastronomy', 'brunch', 'lunch', 'dinner', 'breakfast', 'market', 'foodie'],
  'ARTS_CULTURE': ['art', 'culture', 'museum', 'gallery', 'history', 'historic', 'heritage', 'traditional', 'architecture', 'monuments', 'landmarks', 'sightseeing', 'tourist spots', 'famous places', 'mural', 'street art', 'music', 'dance', 'theater', 'craft', 'artisan', 'local culture'],
  'OUTDOOR_ADVENTURE': ['outdoor', 'adventure', 'hiking', 'nature', 'mountain', 'beach', 'trek', 'climb', 'kayak', 'bike', 'cycling', 'walk', 'explore', 'scenic', 'park', 'forest', 'lake', 'river', 'sunrise', 'sunset'],
  'NIGHTLIFE_SOCIAL': ['nightlife', 'bar', 'club', 'party', 'social', 'drinks', 'dancing', 'night', 'evening', 'late', 'live music', 'concert', 'fun', 'entertainment', 'rooftop'],
  'WELLNESS': ['wellness', 'spa', 'yoga', 'meditation', 'relax', 'relaxation', 'peaceful', 'zen', 'mindfulness', 'retreat', 'health', 'healing', 'calm', 'quiet', 'spiritual', 'temple'],
  'LEARNING': ['learn', 'learning', 'class', 'workshop', 'lesson', 'teach', 'skill', 'photography', 'language', 'craft', 'handmade', 'diy', 'education', 'course'],
  'FAMILY': ['family', 'kids', 'children', 'child-friendly', 'educational', 'fun for all ages'],
};

// Interest synonyms for matching user intent to host interests
const INTEREST_SYNONYMS: Record<string, string[]> = {
  'cooking': ['food', 'culinary', 'chef', 'kitchen', 'recipes', 'gastronomy'],
  'wine': ['winery', 'vineyard', 'sommelier', 'tasting', 'drinks'],
  'history': ['historic', 'heritage', 'old', 'ancient', 'traditional', 'monuments', 'landmarks', 'tourist spots', 'famous'],
  'street art': ['murals', 'graffiti', 'urban art', 'art'],
  'nightlife': ['bars', 'clubs', 'party', 'night out', 'evening', 'drinks'],
  'hiking': ['trekking', 'walking', 'trails', 'nature walks', 'outdoor'],
  'meditation': ['zen', 'mindfulness', 'peaceful', 'calm', 'spiritual', 'wellness'],
  'photography': ['photos', 'camera', 'instagram', 'pictures', 'scenic'],
  'music': ['live music', 'concert', 'drums', 'guitar', 'jazz', 'local music'],
  'architecture': ['buildings', 'design', 'landmarks', 'monuments', 'historic buildings'],
};

export interface SearchIntent {
  categories: string[];
  keywords: string[];
  location?: string;
  preferences: string[];
  activities: string[];
}

export interface ScoredHost {
  host: Host;
  score: number;
  matchReasons: string[];
}

export interface ScoredExperience {
  experience: HostExperience & { hostId: string; hostName: string; hostPhoto: string; city: string; country: string };
  score: number;
  matchReasons: string[];
}

/**
 * Score a host based on extracted search intent
 */
export function scoreHost(host: Host, intent: SearchIntent): ScoredHost {
  let score = 0;
  const matchReasons: string[] = [];
  
  // Normalize intent categories to uppercase for matching
  const normalizedCategories = intent.categories.map(c => c.toUpperCase().replace(/-/g, '_'));

  // Location match (high priority)
  if (intent.location) {
    const locationLower = intent.location.toLowerCase();
    if (host.city.toLowerCase().includes(locationLower) || 
        host.country.toLowerCase().includes(locationLower)) {
      score += 30;
      matchReasons.push(`Located in ${host.city}`);
    }
  }

  // Category match via experience types
  for (const category of normalizedCategories) {
    // Try to match exact uppercase category, or fall back to original for synonym lookup if needed
    // But CATEGORY_SYNONYMS keys are now uppercase.
    const synonyms = CATEGORY_SYNONYMS[category] || [category];
    
    // Check host interests
    for (const interest of host.interests) {
      if (synonyms.some(syn => interest.toLowerCase().includes(syn) || syn.includes(interest.toLowerCase()))) {
        score += 15;
        matchReasons.push(`Interested in ${interest}`);
        break;
      }
    }
    
    // Check experience categories
    for (const exp of host.experiences) {
      if (exp.category === category) {
        score += 20;
        matchReasons.push(`Offers ${category.replace('_', ' ')} experiences`);
        break;
      }
    }
  }

  // Keyword match in interests
  for (const keyword of intent.keywords) {
    const kwLower = keyword.toLowerCase();
    
    // Check interests with synonyms
    for (const interest of host.interests) {
      const interestLower = interest.toLowerCase();
      const synonyms = INTEREST_SYNONYMS[interestLower] || [];
      
      if (interestLower.includes(kwLower) || 
          kwLower.includes(interestLower) ||
          synonyms.some(syn => syn.includes(kwLower) || kwLower.includes(syn))) {
        score += 10;
        if (!matchReasons.includes(`Matches interest: ${interest}`)) {
          matchReasons.push(`Matches interest: ${interest}`);
        }
      }
    }
    
    // Check bio
    if (host.bio.toLowerCase().includes(kwLower)) {
      score += 5;
    }
    
    // Check experience descriptions
    for (const exp of host.experiences) {
      if (exp.title.toLowerCase().includes(kwLower) || 
          exp.description.toLowerCase().includes(kwLower)) {
        score += 8;
        break;
      }
    }
  }

  // Boost by experience ratings
  const avgRating = host.experiences.reduce((sum, exp) => sum + exp.rating, 0) / host.experiences.length;
  score += avgRating * 3; // Max +15 for 5.0 rating

  // Boost by total reviews
  const totalReviews = host.experiences.reduce((sum, exp) => sum + exp.reviewCount, 0);
  score += Math.min(totalReviews / 10, 10); // Max +10

  return {
    host,
    score: Math.round(score),
    matchReasons: [...new Set(matchReasons)].slice(0, 3),
  };
}

/**
 * Score an experience based on extracted search intent
 */
export function scoreExperience(
  experience: HostExperience,
  host: Host,
  intent: SearchIntent
): ScoredExperience {
  let score = 0;
  const matchReasons: string[] = [];
  
  // Normalize intent categories
  const normalizedCategories = intent.categories.map(c => c.toUpperCase().replace(/-/g, '_'));

  // Location match (high priority)
  if (intent.location) {
    const locationLower = intent.location.toLowerCase();
    if (host.city.toLowerCase().includes(locationLower) || 
        host.country.toLowerCase().includes(locationLower)) {
      score += 30;
      matchReasons.push(`In ${host.city}`);
    }
  }

  // Category match
  for (const category of normalizedCategories) {
    if (experience.category === category) {
      score += 25;
      matchReasons.push(`${category.replace('_', ' ')} experience`);
    }
    
    // Check synonyms
    const synonyms = CATEGORY_SYNONYMS[category] || [category];
    if (synonyms.some(syn => 
      experience.title.toLowerCase().includes(syn) || 
      experience.description.toLowerCase().includes(syn)
    )) {
      score += 10;
    }
  }

  // Keyword match
  for (const keyword of intent.keywords) {
    const kwLower = keyword.toLowerCase();
    
    if (experience.title.toLowerCase().includes(kwLower)) {
      score += 15;
      matchReasons.push(`Title matches "${keyword}"`);
    }
    
    if (experience.description.toLowerCase().includes(kwLower)) {
      score += 8;
    }
  }

  // Boost by rating
  score += experience.rating * 4; // Max +20 for 5.0 rating

  // Boost by reviews
  score += Math.min(experience.reviewCount / 10, 10); // Max +10

  return {
    experience: {
      ...experience,
      hostId: host.id,
      hostName: host.name,
      hostPhoto: host.photo,
      city: host.city,
      country: host.country,
    },
    score: Math.round(score),
    matchReasons: [...new Set(matchReasons)].slice(0, 3),
  };
}

/**
 * Semantic search for hosts - scores all hosts and returns top N
 * If intent.location is provided, FILTERS to only hosts in that location
 */
export function semanticSearchHosts(intent: SearchIntent, limit: number = 20): ScoredHost[] {
  // Filter by location first if provided (strict filtering, not just boosting)
  let candidates = HOSTS;
  if (intent.location) {
    const locationLower = intent.location.toLowerCase();
    candidates = HOSTS.filter(host => 
      host.city.toLowerCase().includes(locationLower) || 
      host.country.toLowerCase().includes(locationLower) ||
      locationLower.includes(host.city.toLowerCase()) ||
      locationLower.includes(host.country.toLowerCase())
    );
    // Fallback to all hosts if no location match (prevents empty results)
    if (candidates.length === 0) {
      candidates = HOSTS;
    }
  }
  
  const scored = candidates.map(host => scoreHost(host, intent));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Semantic search for experiences - scores all experiences and returns top N
 * If intent.location is provided, FILTERS to only hosts in that location
 */
export function semanticSearchExperiences(intent: SearchIntent, limit: number = 20): ScoredExperience[] {
  // Filter by location first if provided (strict filtering, not just boosting)
  let candidates = HOSTS;
  if (intent.location) {
    const locationLower = intent.location.toLowerCase();
    candidates = HOSTS.filter(host => 
      host.city.toLowerCase().includes(locationLower) || 
      host.country.toLowerCase().includes(locationLower) ||
      locationLower.includes(host.city.toLowerCase()) ||
      locationLower.includes(host.country.toLowerCase())
    );
    // Fallback to all hosts if no location match (prevents empty results)
    if (candidates.length === 0) {
      candidates = HOSTS;
    }
  }
  
  const allExperiences: ScoredExperience[] = [];
  
  for (const host of candidates) {
    for (const experience of host.experiences) {
      allExperiences.push(scoreExperience(experience, host, intent));
    }
  }
  
  return allExperiences
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get all categories from synonyms
 */
export function getAllCategories(): string[] {
  return Object.keys(CATEGORY_SYNONYMS);
}
