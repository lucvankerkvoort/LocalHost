import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listTripRevisionsForUser } from '@/lib/trips/repository';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { tripId } = await params;
    const revisions = await listTripRevisionsForUser(session.user.id, tripId);
    if (!revisions) {
      return new NextResponse('Not Found', { status: 404 });
    }

    return NextResponse.json({
      success: true,
      tripId: revisions.tripId,
      currentVersion: revisions.currentVersion,
      revisions: revisions.revisions,
    });
  } catch (error) {
    console.error('[TRIP_REVISIONS_GET]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
