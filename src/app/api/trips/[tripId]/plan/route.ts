import { NextResponse } from 'next/server';
import { auth } from '@/auth';

import { persistTripPlanAsUser, TripPlanPersistenceError } from '@/lib/trips/persistence';

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

    const body = await req.json();
    const { stops, preferences, title } = body;
    // Expect body to be { stops: [ { city, days: [ { items: [] } ] } ] } roughly

    if (!Array.isArray(stops)) {
      return new NextResponse('Invalid payload', { status: 400 });
    }

    const dayIdMap = await persistTripPlanAsUser({
      tripId,
      userId: session.user.id,
      stops,
      preferences,
      title,
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
      return new NextResponse('Forbidden', { status: error.status });
    }
    console.error('[TRIP_PLAN_POST]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
