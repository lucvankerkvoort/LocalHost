import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { computeGoogleRoutePath } from '@/lib/maps/google-routes';
import { auth } from '@/auth';
import { rateLimit } from '@/lib/api/rate-limit';

const ComputeRouteSchema = z.object({
  fromLat: z.number(),
  fromLng: z.number(),
  toLat: z.number(),
  toLng: z.number(),
  mode: z.enum(['flight', 'train', 'drive', 'boat', 'walk']),
});

const computeRouteIpLimiter = rateLimit({
  prefix: 'routes-compute-ip',
  interval: 60_000,
  limit: 60,
});

const computeRouteUserLimiter = rateLimit({
  prefix: 'routes-compute-user',
  interval: 60_000,
  limit: 30,
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = ComputeRouteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid route request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.mode === 'flight' || parsed.data.mode === 'boat') {
      return NextResponse.json({
        points: [
          { lat: parsed.data.fromLat, lng: parsed.data.fromLng },
          { lat: parsed.data.toLat, lng: parsed.data.toLng },
        ],
        distanceMeters: null,
        durationSeconds: null,
        source: 'fallback',
      });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
    const [ipLimit, userLimit] = await Promise.all([
      computeRouteIpLimiter.check(ip),
      computeRouteUserLimiter.check(session.user.id),
    ]);

    if (!ipLimit.success || !userLimit.success) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((Math.max(ipLimit.resetAt, userLimit.resetAt) - Date.now()) / 1000)
      );
      return NextResponse.json(
        { error: 'Too many route requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
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
