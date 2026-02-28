import { NextResponse } from 'next/server';
import { auth } from '@/auth';

import { persistTripPlanAsUser, TripPlanPersistenceError } from '@/lib/trips/persistence';
import {
  TripPlanWritePayloadSchema,
  formatTripPlanValidationIssues,
} from '@/lib/trips/contracts/trip-plan.schema';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { tripId } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
        { status: 400 }
      );
    }

    const parsed = TripPlanWritePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_PAYLOAD',
          message: 'Trip plan payload failed validation.',
          issues: formatTripPlanValidationIssues(parsed.error),
        },
        { status: 400 }
      );
    }
    const { stops, preferences, title } = parsed.data;
    const expectedVersionHeader = req.headers.get('x-trip-expected-version');
    const expectedVersion =
      expectedVersionHeader && /^\d+$/.test(expectedVersionHeader)
        ? Number.parseInt(expectedVersionHeader, 10)
        : undefined;

    const dayIdMap = await persistTripPlanAsUser({
      tripId,
      userId: session.user.id,
      stops,
      preferences,
      title,
      expectedVersion,
      audit: {
        source: 'api',
        actor: 'api.trips.plan.post',
      },
    });

    return NextResponse.json({ success: true, dayIdMap });
  } catch (error) {
    if (error instanceof TripPlanPersistenceError) {
      if (error.code === 'NOT_FOUND') {
        return new NextResponse('Not Found', { status: error.status });
      }
      if (error.code === 'VERSION_CONFLICT') {
        return NextResponse.json(
          {
            success: false,
            error: 'VERSION_CONFLICT',
            message: error.message,
          },
          { status: error.status }
        );
      }
      return new NextResponse('Forbidden', { status: error.status });
    }
    console.error('[TRIP_PLAN_POST]', error);
    const msg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
    return new NextResponse(`Internal Error: ${msg}`, { status: 500 });
  }
}
