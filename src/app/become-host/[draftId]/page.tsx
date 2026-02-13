import { geocodeCity } from '@/lib/server-geocoding';
import { EditorLayout } from '@/components/features/host-creation/editor-layout';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import type { HostCreationState } from '@/store/host-creation-slice';
import { DraftStatus } from '@prisma/client';

interface PageProps {
  params: Promise<{ draftId: string }>;
}

export default async function BecomeHostEditorPage({ params }: PageProps) {
  const { draftId } = await params;
  const session = await auth();
  
  if (!session?.user) {
    redirect('/api/auth/signin');
  }

  // 1. Try to find as a Draft
  let draft = await prisma.experienceDraft.findUnique({
    where: { id: draftId },
    include: { stops: { orderBy: { order: 'asc' } } }
  });

  const mapDraftStatus = (
    status: DraftStatus | null
  ): HostCreationState['status'] => {
    switch (status) {
      case 'AI_GENERATED':
        return 'synthesizing';
      case 'READY_TO_PUBLISH':
        return 'review';
      case 'IN_PROGRESS':
      default:
        return 'draft';
    }
  };

  if (draft && draft.userId === session.user.id) {
    // Retroactive Fix: If city exists but no coords, try to heal it
    if (draft.city && (!draft.cityLat || !draft.cityLng)) {
      const coords = await geocodeCity(draft.city);
      if (coords) {
        draft = await prisma.experienceDraft.update({
          where: { id: draft.id },
          data: {
            cityLat: coords.lat,
            cityLng: coords.lng,
          },
          include: { stops: { orderBy: { order: 'asc' } } }
        });
      }
    }
    const initialData = {
      ...draft,
      status: mapDraftStatus(draft.status),
    } as Partial<HostCreationState>;
    return <EditorLayout draftId={draftId} initialData={initialData} />;
  }

  // 2. If no draft, try to find as a Published Experience (Refine flow)
  const published = await prisma.hostExperience.findUnique({
    where: { id: draftId },
    include: { stops: true }
  });

  if (published && published.hostId === session.user.id) {
    // Geocode built-in city if possible (published exp doesn't have coords)
    // Note: Published experience table doesn't have cityLat/Lng, so we must geocode
    const coords = await geocodeCity(published.city);

    // Create Clone
    const newDraft = await prisma.experienceDraft.create({
      data: {
        userId: session.user.id,
        title: published.title,
        shortDesc: published.shortDesc,
        longDesc: published.longDesc,
        city: published.city,
        cityLat: coords?.lat,
        cityLng: coords?.lng,
        country: published.country,
        duration: published.duration,
        // ... stops cloning
        stops: {
          create: published.stops.map(stop => ({
            name: stop.name,
            description: stop.description,
            address: stop.address,
            lat: stop.lat,
            lng: stop.lng,
            order: stop.order,
          }))
        }
      }
    });

    redirect(`/become-host/${newDraft.id}`);
  }

  redirect('/become-host');
}
