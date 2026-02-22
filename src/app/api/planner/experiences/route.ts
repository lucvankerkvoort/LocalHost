import { NextResponse } from 'next/server';
import type { ExperienceStop, User } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { derivePlannerHosts } from '@/lib/planner/experiences';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rawCity = searchParams.get('city');
    if (!rawCity || !rawCity.trim()) {
      return new NextResponse('City is required', { status: 400 });
    }

    const city = rawCity.trim();

    const experiences = await prisma.experience.findMany({
      where: {
        isActive: true,
        city: {
          equals: city,
          mode: 'insensitive',
        },
      },
      orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
      take: 120,
    });

    const hostIds = Array.from(
      new Set(experiences.map((experience) => experience.hostId).filter(Boolean))
    );
    const hostsById = new Map<string, User>();
    if (hostIds.length > 0) {
      const users = await prisma.user.findMany({
        where: {
          id: { in: hostIds },
          isHost: true,
        },
      });
      for (const user of users) {
        hostsById.set(user.id, user);
      }
    }

    const experienceIds = experiences.map((experience) => experience.id);
    let stops: ExperienceStop[] = [];
    if (experienceIds.length > 0) {
      try {
        stops = await prisma.experienceStop.findMany({
          where: {
            experienceId: { in: experienceIds },
          },
          orderBy: { order: 'asc' },
        });
      } catch (error) {
        // Stops are optional for planner host cards; keep the endpoint healthy if stop data is unavailable.
        console.warn('[planner/experiences] failed to load stops; continuing without stops', error);
      }
    }

    const stopsByExperienceId = new Map<string, typeof stops>();
    for (const stop of stops) {
      if (!stop.experienceId) continue;
      const existing = stopsByExperienceId.get(stop.experienceId) ?? [];
      existing.push(stop);
      stopsByExperienceId.set(stop.experienceId, existing);
    }

    const hostSources = experiences
      .map((experience) => {
        const host = hostsById.get(experience.hostId);
        if (!host) return null;

        return {
          id: experience.id,
          title: experience.title,
          description: experience.description,
          category: experience.category,
          duration: experience.duration,
          price: experience.price,
          rating: experience.rating,
          reviewCount: experience.reviewCount,
          photos: experience.photos,
          city: experience.city,
          country: experience.country,
          latitude: experience.latitude,
          longitude: experience.longitude,
          stops: (stopsByExperienceId.get(experience.id) ?? []).map((stop) => ({
            id: stop.id,
            name: stop.name,
            description: stop.description,
            address: stop.address,
            lat: stop.lat,
            lng: stop.lng,
            order: stop.order,
          })),
          host: {
            id: host.id,
            name: host.name,
            image: host.image,
            bio: host.bio,
            quote: host.quote,
            responseTime: host.responseTime,
            languages: host.languages,
            interests: host.interests,
            city: host.city,
            country: host.country,
            isHost: host.isHost,
          },
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const hosts = derivePlannerHosts(city, hostSources);
    return NextResponse.json({ city, hosts });
  } catch (error) {
    console.error('[planner/experiences] GET failed', error);
    return new NextResponse('Failed to fetch planner experiences', { status: 500 });
  }
}
