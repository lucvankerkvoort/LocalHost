'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth'; // Assuming auth is set up here, based on file list
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { TripStatus } from '@prisma/client';

export type CreateTripData = {
  title: string;
  city: string;
  startDate?: Date; // Optional for MVP
  endDate?: Date;   // Optional for MVP
};

export async function getUserTrips() {
  const session = await auth();
  
  if (!session?.user?.id) {
    return [];
  }

  try {
    const trips = await prisma.trip.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        stops: {
          orderBy: {
            order: 'asc',
          },
          take: 1
        }
      }
    });
    return trips;
  } catch (error) {
    console.error('Failed to fetch trips:', error);
    return [];
  }
}

export async function createTrip(data: CreateTripData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const { title, city, startDate, endDate } = data;

  try {
    const newTrip = await prisma.trip.create({
      data: {
        userId: session.user.id,
        title: title || `Trip to ${city}`,
        status: TripStatus.DRAFT,
        startDate,
        endDate,
        stops: {
          create: {
            city: city, // Storing city directly on stop for now, coordinates can be resolved later or passed if available
            country: '', // Placeholder, should be resolved ideally
            lat: 0, // Placeholder
            lng: 0, // Placeholder
            order: 0
          }
        }
      },
    });

    revalidatePath('/trips');
    return { success: true, tripId: newTrip.id };
  } catch (error) {
    return { success: false, error: 'Failed to create trip' };
  }
}

export async function deleteTrip(tripId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      return { success: false, error: 'Trip not found' };
    }

    if (trip.userId !== session.user.id) {
      return { success: false, error: 'Forbidden' };
    }

    await prisma.trip.delete({
      where: { id: tripId },
    });

    revalidatePath('/trips');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete trip:', error);
    return { success: false, error: 'Failed to delete trip' };
  }
}
