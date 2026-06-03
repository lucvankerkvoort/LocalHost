import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { z } from 'zod';
import {
  googlePlacesSearchText,
  resolveGooglePlacesApiKey,
} from '@/lib/providers/google-places-client';

const SearchParamsSchema = z.object({
  q: z.string().min(1).max(200),
  context: z.string().max(100).optional(), // e.g. "Tokyo, Japan" — biases results
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export interface PlaceSearchResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: 'landmark' | 'museum' | 'restaurant' | 'park' | 'neighborhood' | 'other';
}

/**
 * GET /api/places/search?q=Eiffel+Tower&context=Paris,France&limit=5
 *
 * Lightweight place search for the "Add Stop" search bar.
 * Calls Google Places Text Search and returns a trimmed result list.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = SearchParamsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params', issues: parsed.error.issues }, { status: 400 });
  }

  const { q, context, limit } = parsed.data;

  const apiKey = resolveGooglePlacesApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'Places API not configured' }, { status: 503 });
  }

  const textQuery = context ? `${q} ${context}` : q;

  try {
    const resp = await googlePlacesSearchText({
      apiKey,
      fieldMask: 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
      body: {
        textQuery,
        pageSize: limit,
        languageCode: process.env.GOOGLE_PLACES_LANGUAGE ?? 'en',
      },
    });

    if (!resp.ok) {
      console.error('[places/search] Google Places error', resp.status, await resp.text());
      return NextResponse.json({ error: 'Places search failed' }, { status: 502 });
    }

    const data = await resp.json() as {
      places?: Array<{
        id: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        types?: string[];
      }>;
    };

    const results: PlaceSearchResult[] = (data.places ?? []).map((p) => ({
      placeId: p.id,
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
      lat: p.location?.latitude ?? 0,
      lng: p.location?.longitude ?? 0,
      category: resolveCategory(p.types ?? []),
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[places/search]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function resolveCategory(types: string[]): PlaceSearchResult['category'] {
  if (types.some((t) => ['restaurant', 'food', 'cafe', 'bar', 'bakery'].includes(t))) return 'restaurant';
  if (types.some((t) => ['museum', 'art_gallery'].includes(t))) return 'museum';
  if (types.some((t) => ['park', 'natural_feature', 'campground'].includes(t))) return 'park';
  if (types.some((t) => ['neighborhood', 'sublocality', 'locality'].includes(t))) return 'neighborhood';
  if (types.some((t) => ['tourist_attraction', 'point_of_interest', 'landmark'].includes(t))) return 'landmark';
  return 'other';
}
