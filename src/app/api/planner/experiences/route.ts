import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { derivePlannerHosts } from '@/lib/planner/experiences';

export async function GET(req: Request) {
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
      host: {
        isHost: true,
      },
    },
    include: {
      host: true,
    },
  });

  const hosts = derivePlannerHosts(
    city,
    experiences.map((experience) => ({
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
      host: {
        id: experience.host.id,
        name: experience.host.name,
        image: experience.host.image,
        bio: experience.host.bio,
        quote: experience.host.quote,
        responseTime: experience.host.responseTime,
        languages: experience.host.languages,
        interests: experience.host.interests,
        city: experience.host.city,
        country: experience.host.country,
        isHost: experience.host.isHost,
      },
    }))
  );

  return NextResponse.json({ city, hosts });
}
