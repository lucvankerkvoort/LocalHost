import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getTripCurrentVersionForUser,
  restoreTripRevisionForUser,
} from '@/lib/trips/repository';
import { TripPlanPersistenceError } from '@/lib/trips/persistence';

type RestoreRequestBody = {
  expectedVersion?: number;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string; revisionId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { tripId, revisionId } = await params;
    let body: RestoreRequestBody = {};
    try {
      body = (await req.json()) as RestoreRequestBody;
    } catch {
      body = {};
    }

    const result = await restoreTripRevisionForUser({
      userId: session.user.id,
      tripId,
      revisionId,
      expectedVersion:
        typeof body.expectedVersion === 'number' && Number.isInteger(body.expectedVersion)
          ? body.expectedVersion
          : undefined,
      actor: 'api.trips.revisions.restore',
      reason: 'restore_trip_revision',
    });

    const currentVersion = await getTripCurrentVersionForUser(session.user.id, tripId);
    return NextResponse.json({
      success: true,
      tripId,
      revisionId,
      restoredFromVersion: result.restoredFromVersion,
      restoredVersion: result.restoredVersion,
      currentVersion,
    });
  } catch (error) {
    if (error instanceof TripPlanPersistenceError) {
      if (error.code === 'NOT_FOUND') {
        return new NextResponse('Not Found', { status: 404 });
      }
      if (error.code === 'VERSION_CONFLICT') {
        return NextResponse.json(
          {
            success: false,
            error: 'VERSION_CONFLICT',
            message: error.message,
          },
          { status: 409 }
        );
      }
      return new NextResponse('Forbidden', { status: 403 });
    }
    if (error instanceof Error && /not found/i.test(error.message)) {
      return new NextResponse('Not Found', { status: 404 });
    }
    console.error('[TRIP_REVISION_RESTORE_POST]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
