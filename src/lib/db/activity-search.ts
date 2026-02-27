import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateEmbedding } from '@/lib/ai/embeddings';

export interface ActivitySearchResult {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  formattedAddress: string;
  cityName?: string | null;
  country?: string | null;
  rating: number | null;
  priceLevel: number | null;
  similarity: number;
  engagementScore: number;
  finalScore: number; // Combination of similarity and engagement
}

export interface ActivitySearchOptions {
  cityId?: string;
  limit?: number;
  minSimilarity?: number;
}

type RawActivitySearchRow = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  formattedAddress: string;
  cityName: string | null;
  country: string | null;
  rating: number | null;
  priceLevel: number | null;
  engagementScore: number;
  similarity: number;
};

/**
 * Performs a Retrieval-Augmented Generation (RAG) semantic search 
 * for activities using pgvector cosine distance.
 * 
 * Orders results by a combination of semantic relevance and historical user engagement.
 */
export async function searchActivitiesSemantic(
  query: string,
  options: ActivitySearchOptions = {}
): Promise<ActivitySearchResult[]> {
  const { cityId, limit = 50, minSimilarity = 0.3 } = options;

  // 1. Convert the natural language query into a vector representation
  let vector: number[];
  try {
    vector = await generateEmbedding(query);
  } catch (err) {
    console.error(`Failed to generate embedding for query: "${query}"`, err);
    return [];
  }

  // Postgres pgvector requires vectors formatted as strings: '[0.1, 0.2, ...]'
  const vectorString = `[${vector.join(',')}]`;

  // 2. Perform the semantic search in PostgreSQL using raw SQL
  // The operators: 
  // <=> is cosine distance (1 - cosine_similarity). Lower is better.
  // <-> is Euclidean distance
  // <#> is negative inner product
  
  try {
    const cityFilter = cityId ? Prisma.sql`AND a."cityId" = ${cityId}` : Prisma.empty;

    // Note: To return similarity (0 to 1, where 1 is exact match) from cosine distance:
    // similarity = 1 - (embedding <=> vector)
    const results = await prisma.$queryRaw<RawActivitySearchRow[]>`
      SELECT 
        a."id", a."name", a."category", a."lat", a."lng", a."formattedAddress",
        a."rating", a."priceLevel", a."engagementScore",
        c."name" AS "cityName", c."country" AS "country",
        (1 - (a."embedding" <=> ${vectorString}::vector)) AS "similarity"
      FROM "Activity" a
      JOIN "City" c ON c."id" = a."cityId"
      WHERE a."embedding" IS NOT NULL
        ${cityFilter}
        AND (1 - (a."embedding" <=> ${vectorString}::vector)) >= ${minSimilarity}
      ORDER BY (1 - (a."embedding" <=> ${vectorString}::vector)) * a."engagementScore" DESC
      LIMIT ${limit}
    `;

    // 3. Map raw SQL results mapping back to TypeScript
    return results.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      lat: row.lat,
      lng: row.lng,
      formattedAddress: row.formattedAddress,
      cityName: row.cityName ?? null,
      country: row.country ?? null,
      rating: row.rating,
      priceLevel: row.priceLevel,
      similarity: row.similarity,
      engagementScore: row.engagementScore,
      // Provide the final combined score to the frontend/LLM for transparent sorting
      finalScore: row.similarity * row.engagementScore,
    }));
  } catch (err) {
    console.error('Vector search query failed:', err);
    return [];
  }
}
