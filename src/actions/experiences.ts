'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export type MyExperience = {
  id: string;
  type: 'DRAFT' | 'PUBLISHED';
  statusLabel: string; // 'Draft' | 'Published'
  title: string;
  location: string;
  description: string | null;
  updatedAt: Date;
  imageUrl?: string; // Optional cover image
};

export async function getUserExperiences(): Promise<{ success: boolean; data?: MyExperience[]; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const userId = session.user.id;

    // 1. Fetch Drafts
    const drafts = await prisma.experienceDraft.findMany({
      where: { userId },
      include: { stops: true }
    });

    // 2. Fetch Published Experience
    const published = await prisma.hostExperience.findUnique({
      where: { hostId: userId },
      include: { stops: true }
    });

    const experiences: MyExperience[] = [];

    // Map Drafts
    drafts.forEach(draft => {
      experiences.push({
        id: draft.id,
        type: 'DRAFT',
        statusLabel: 'Draft',
        title: draft.title || 'Untitled Draft',
        location: draft.city || 'Unknown Location',
        description: draft.shortDesc || draft.longDesc || 'No description yet.',
        updatedAt: draft.updatedAt,
      });
    });

    // Map Published
    if (published) {
      experiences.push({
        id: published.id,
        type: 'PUBLISHED',
        statusLabel: 'Published', // Could be 'Unpublished' based on status enum if we wanted
        title: published.title,
        location: published.city,
        description: published.shortDesc,
        updatedAt: published.updatedAt,
        // imageUrl: published.photos?.[0] // If unique photo field exists? Schema has photos on Experience but HostExperience definition might be slightly different in my memory. 
        // Checking schema: HostExperience doesn't have `photos` array? 
        // Wait, schema check:
        // model Experience (HostedExperiences) has `photos String[]`.
        // model HostExperience (HostExperience) key is separate? 
        // Double check schema.
      });
    }
    
    // Sort by most recently updated
    experiences.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return { success: true, data: experiences };

  } catch (error) {
    console.error('Failed to fetch user experiences:', error);
    return { success: false, error: 'Failed to load experiences' };
  }
}

export async function createExperienceDraft(): Promise<{ success: boolean; draftId?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }; 
    }

    const userId = session.user.id;

    // Create new draft directly (multi-draft supported)
    const draft = await prisma.experienceDraft.create({
      data: {
        userId,
        title: 'New Experience',
      }
    });

    return { success: true, draftId: draft.id };
  } catch (error) {
    console.error('Failed to create draft:', error);
    return { success: false, error: 'Failed to create experience draft' };
  }
}

export async function saveExperienceDraft(
  draftId: string, 
  data: { 
    title?: string; 
    shortDesc?: string; 
    longDesc?: string;
    sections?: any; 
    price?: number;
    currency?: string;
    stops?: any[]; 
    city?: string;
    cityLat?: number;
    cityLng?: number;
    duration?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }
    
    // Verify ownership
    const draft = await prisma.experienceDraft.findUnique({
      where: { id: draftId },
    });

    if (!draft || draft.userId !== session.user.id) {
      return { success: false, error: 'Draft not found or unauthorized' };
    }

    // Update using transaction to accept writes
    // We treat 'stops' as a full replacement if provided
    await prisma.$transaction(async (tx) => {
      // 1. Update draft fields
      await tx.experienceDraft.update({
        where: { id: draftId },
        data: {
          title: data.title,
          shortDesc: data.shortDesc,
          longDesc: data.longDesc,
          sections: data.sections ? data.sections : undefined,
          price: data.price,
          currency: data.currency,
          city: data.city,
          cityLat: data.cityLat,
          cityLng: data.cityLng,
          duration: data.duration,
          updatedAt: new Date(),
        }
      });

      // 2. Handle stops if provided (full replacement)
      if (data.stops) {
        // Delete all existing stops for this draft
        await tx.experienceStop.deleteMany({
          where: { draftId },
        });

        // Create new stops
        if (data.stops.length > 0) {
          await tx.experienceStop.createMany({
            data: data.stops.map((stop: any, index: number) => ({
              draftId,
              name: stop.name,
              description: stop.description || '',
              address: stop.address || '',
              lat: stop.lat,
              lng: stop.lng,
              order: index + 1, // Ensure strict ordering
              // If stop.id is a CUID/UUID from frontend, we lose it here and generate new ones
              // This is acceptable for Drafts. If we wanted to preserve, we'd upsert.
            })),
          });
        }
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to save draft:', error);
    return { success: false, error: 'Failed to save draft' };
  }
}

export async function deleteExperience(id: string, type: 'DRAFT' | 'PUBLISHED'): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const userId = session.user.id;

    if (type === 'DRAFT') {
      const draft = await prisma.experienceDraft.findUnique({ where: { id } });
      if (!draft || draft.userId !== userId) {
        return { success: false, error: 'Draft not found or unauthorized' };
      }
      await prisma.experienceDraft.delete({ where: { id } });
    } else {
      const published = await prisma.hostExperience.findUnique({ where: { id } });
      if (!published || published.hostId !== userId) {
        return { success: false, error: 'Experience not found or unauthorized' };
      }
      await prisma.hostExperience.delete({ where: { id } });
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to delete experience:', error);
    return { success: false, error: 'Failed to delete experience' };
  }
}
