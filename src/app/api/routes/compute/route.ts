import { NextResponse } from 'next/server';
import { z } from 'zod';

import { computeGoogleRoutePath } from '@/lib/maps/google-routes';

const ComputeRouteSchema = z.object({
  fromLat: z.number(),
  fromLng: z.number(),
  toLat: z.number(),
  toLng: z.number(),
  mode: z.enum(['flight', 'train', 'drive', 'boat', 'walk']),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = ComputeRouteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid route request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await computeGoogleRoutePath(
      { lat: parsed.data.fromLat, lng: parsed.data.fromLng },
      { lat: parsed.data.toLat, lng: parsed.data.toLng },
      parsed.data.mode
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[routes/compute] error', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

