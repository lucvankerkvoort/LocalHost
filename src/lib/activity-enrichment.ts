import { prisma } from '@/lib/prisma';
import { generateEmbeddings } from '@/lib/ai/embeddings';
import { resolveGoogleApiKey } from '@/lib/ai/tools/resolve-place';

export const ACTIVITY_COVERAGE_THRESHOLD = {
  1: 60, // Tier 1 cities (e.g., London, Paris) need at least 60 curated activities
  2: 30, // Tier 2 cities need 30
  3: 15, // Tier 3 (long tail) need 15
};

export type InternalCategory = 
  | 'Landmark'
  | 'Museum'
  | 'Park'
  | 'Restaurant'
  | 'Cafe'
  | 'Nightlife'
  | 'Shopping'
  | 'Entertainment'
  | 'Other';

/**
 * Maps Google Places API types to our clean, internal taxonomy.
 */
function mapGoogleTypeToInternalCategory(types: string[]): InternalCategory {
  if (!types || types.length === 0) return 'Other';
  const t = types.join(',').toLowerCase();
  
  if (t.includes('museum') || t.includes('art_gallery')) return 'Museum';
  if (t.includes('park') || t.includes('natural_feature') || t.includes('hiking')) return 'Park';
  if (t.includes('tourist_attraction') || t.includes('historical_landmark') || t.includes('church') || t.includes('place_of_worship')) return 'Landmark';
  if (t.includes('restaurant') || t.includes('food') || t.includes('meal')) return 'Restaurant';
  if (t.includes('cafe') || t.includes('bakery')) return 'Cafe';
  if (t.includes('bar') || t.includes('night_club')) return 'Nightlife';
  if (t.includes('shopping') || t.includes('store') || t.includes('clothing')) return 'Shopping';
  if (t.includes('amusement_park') || t.includes('stadium') || t.includes('aquarium') || t.includes('zoo')) return 'Entertainment';
  
  return 'Other';
}

/**
 * Generates the text payload that will be embedded as a vector.
 * The richness of this text determines the quality of semantic search.
 */
function createEmbeddingPayload(place: {
  name: string;
  category: string;
  cityName: string;
  rating?: number;
  priceLevel?: number;
  types: string[];
}): string {
  const priceDesc = place.priceLevel 
    ? (place.priceLevel === 1 ? 'cheap eats, budget' : place.priceLevel >= 3 ? 'expensive, luxury, fine dining' : 'moderate price')
    : 'unknown budget';
  
  const ratingDesc = place.rating && place.rating >= 4.5 ? 'highly rated, popular, excellent' : '';
  const tags = place.types.join(', ').replace(/_/g, ' ');

  return `Name: ${place.name}
Category: ${place.category}
Location: ${place.cityName}
Vibe/Tags: ${tags}
Price/Budget: ${priceDesc}
Quality: ${ratingDesc}`.trim();
}

/**
 * Checks a city's coverage and enriches it via Google Places if necessary.
 * Generates embeddings for the new places and saves them to the vectors DB.
 */
export async function ensureCityEnriched(cityName: string, country: string, tier: 1 | 2 | 3 = 2) {
  // 1. Get or create the City
  let city = await prisma.city.findUnique({
    where: { name_country: { name: cityName, country } },
  });

  if (!city) {
    city = await prisma.city.create({
      data: { name: cityName, country, tier, activityCount: 0 },
    });
  }

  // 2. Check coverage threshold
  const targetCount = ACTIVITY_COVERAGE_THRESHOLD[tier];
  if (city.activityCount >= targetCount && city.lastEnrichedAt) {
    // Already sufficiently enriched—skip expensive API calls
    return { status: 'sufficient', city };
  }

  // 3. We lack coverage. Fetch generic "top places" from Google to seed the city.
  // In a production app, we would do multiple localized category searches here (e.g. "top museums", "best cafes")
  const categoriesToSearch = [
    { query: `Top tourist attractions in ${cityName}, ${country}` },
    { query: `Best restaurants in ${cityName}, ${country}` },
    { query: `Best museums and arts in ${cityName}, ${country}` },
    { query: `Best parks and nature in ${cityName}, ${country}` },
  ];

  const apiKey = resolveGoogleApiKey();
  if (!apiKey) {
    return { status: 'failed_API_key_missing', city };
  }

  const rawPlaces: any[] = [];
  for (const search of categoriesToSearch) {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // Request the fields we need for rich embeddings
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.priceLevel,places.userRatingCount',
      },
      body: JSON.stringify({
        textQuery: search.query,
        pageSize: 10,
        languageCode: process.env.GOOGLE_PLACES_LANGUAGE || 'en',
      }),
    });
    
    if (response.ok) {
        const payload = await response.json();
        if (payload.places && Array.isArray(payload.places)) {
            rawPlaces.push(...payload.places);
        }
    } else {
        console.warn(`[ensureCityEnriched] Google Places failed for "${search.query}"`, response.status);
    }
  }

  // Deduplicate by place id (field returned by new Places API is 'id')
  const uniquePlacesMap = new Map();
  for (const place of rawPlaces) {
    if (place.id && !uniquePlacesMap.has(place.id)) {
      uniquePlacesMap.set(place.id, place);
    }
  }
  const uniquePlaces = Array.from(uniquePlacesMap.values());

  if (uniquePlaces.length === 0) {
    return { status: 'failed_to_fetch', city };
  }

  // 4. Map, clean, and format the data
  const activitiesToEmbed = uniquePlaces.map(place => {
    const internalCategory = mapGoogleTypeToInternalCategory(place.types || []);
    const name = place.displayName?.text || place.name || 'Unknown';
    return {
      externalId: place.id,
      name,
      lat: place.location?.latitude || 0,
      lng: place.location?.longitude || 0,
      formattedAddress: place.formattedAddress || '',
      rating: place.rating || null,
      priceLevel: place.priceLevel || null,
      category: internalCategory,
      metadataJson: { types: place.types || [], userRatingsTotal: place.userRatingCount },
      // The text that will be converted into a vector embedding
      embeddingTextPayload: createEmbeddingPayload({
        name,
        category: internalCategory,
        cityName,
        rating: place.rating,
        priceLevel: place.priceLevel,
        types: place.types || [],
      }),
    };
  });

  // 5. Generate embeddings in bulk via OpenAI
  const embeddingTexts = activitiesToEmbed.map(a => a.embeddingTextPayload);
  let embeddings: number[][] = [];
  try {
    embeddings = await generateEmbeddings(embeddingTexts);
  } catch (err) {
    console.error(`Failed to generate embeddings for ${cityName}:`, err);
    return { status: 'embedding_failed', city };
  }

  // 6. Save to database using Prisma raw query to handle the Unsupported("vector") type
  let insertedCount = 0;
  for (let i = 0; i < activitiesToEmbed.length; i++) {
    const activity = activitiesToEmbed[i];
    const vector = embeddings[i];

    if (!vector || vector.length !== 1536) continue;

    const vectorString = `[${vector.join(',')}]`;

    try {
      // Use raw SQL to insert the vector type properly
      await prisma.$executeRaw`
        INSERT INTO "Activity" (
          "id", "cityId", "source", "externalId", "name", "category",
          "rating", "priceLevel", "lat", "lng", "formattedAddress",
          "metadataJson", "engagementScore", "embedding", "updatedAt"
        )
        VALUES (
          gen_random_uuid()::text,
          ${city.id},
          'google',
          ${activity.externalId},
          ${activity.name},
          ${activity.category},
          ${activity.rating},
          ${activity.priceLevel},
          ${activity.lat},
          ${activity.lng},
          ${activity.formattedAddress},
          ${activity.metadataJson}::jsonb,
          1.0,
          ${vectorString}::vector,
          now()
        )
        ON CONFLICT ("externalId") DO NOTHING;
      `;
      insertedCount++;
    } catch (e) {
      console.warn(`Failed to insert activity ${activity.name}: `, e);
    }
  }

  // 7. Update City totals
  const updatedCity = await prisma.city.update({
    where: { id: city.id },
    data: {
      activityCount: { increment: insertedCount },
      lastEnrichedAt: new Date(),
      enrichmentScore: Math.min(100, ((city.activityCount + insertedCount) / targetCount) * 100),
    },
  });

  return { status: 'enriched', city: updatedCity, newActivitiesFound: insertedCount };
}
