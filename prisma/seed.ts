import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { HOSTS } from '../src/lib/data/hosts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the seed script.');
}

const prisma = new PrismaClient({
  // @ts-ignore
  accelerateUrl: databaseUrl,
  log: ['info', 'warn', 'error'],
});

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.message.deleteMany();
  await prisma.review.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.experienceAvailability.deleteMany();
  await prisma.experience.deleteMany();
  await prisma.experienceStop.deleteMany();
  await prisma.experienceDraft.deleteMany();
  await prisma.hostExperience.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  console.log('✓ Cleared existing data');

  const password = await bcrypt.hash('password', 10);

  const hostUsers = new Map<string, { id: string }>();

  for (const host of HOSTS) {
    const accountId = `acct_test_${host.id.replace(/[^a-z0-9]/gi, '')}`;
    const user = await prisma.user.create({
      data: {
        id: host.id,
        email: `${host.id}@localhost.com`,
        name: host.name,
        bio: host.bio,
        quote: host.quote,
        responseTime: host.responseTime,
        image: host.photo,
        city: host.city,
        country: host.country,
        languages: host.languages,
        interests: host.interests,
        isHost: true,
        isVerified: true,
        verificationTier: 'VERIFIED',
        trustScore: 80,
        stripeConnectedAccountId: accountId,
        stripeOnboardingStatus: 'COMPLETE',
        payoutsEnabled: true,
        chargesEnabled: true,
        password,
      },
    });
    hostUsers.set(host.id, { id: user.id });
  }

  const demoGuest = await prisma.user.create({
    data: {
      email: 'demo@localhost.com',
      name: 'Demo User',
      bio: 'Adventurous traveler looking for authentic local experiences.',
      city: 'San Francisco',
      country: 'USA',
      languages: ['English'],
      interests: ['Travel', 'Food', 'Culture'],
      isHost: true,
      isVerified: true,
      verificationTier: 'VERIFIED',
      trustScore: 75,
      password,
    },
  });

  const traveler = await prisma.user.create({
    data: {
      id: 'guest-traveler',
      email: 'guest@localhost.com',
      name: 'Guest Traveler',
      bio: 'Curious traveler testing Localhost.',
      city: 'San Francisco',
      country: 'USA',
      languages: ['English'],
      interests: ['Travel', 'Food', 'Culture'],
      isHost: false,
      isVerified: true,
      verificationTier: 'BASIC',
      trustScore: 40,
      password,
    },
  });

  console.log('✓ Created users');

  const experienceRecords = new Map<
    string,
    { id: string; hostId: string; price: number; currency: string; neighborhood: string; city: string; country: string }
  >();

  for (const host of HOSTS) {
    for (const exp of host.experiences) {
      const experience = await prisma.experience.create({
        data: {
          id: exp.id,
          hostId: host.id,
          title: exp.title,
          description: exp.description,
          category: exp.category,
          neighborhood: host.city,
          city: host.city,
          country: host.country,
          duration: exp.duration,
          minGroupSize: 1,
          maxGroupSize: 6,
          price: exp.price,
          currency: 'USD',
          includedItems: [],
          excludedItems: [],
          photos: exp.photos,
          rating: exp.rating,
          reviewCount: exp.reviewCount,
          isActive: true,
        },
      });
      experienceRecords.set(exp.id, {
        id: experience.id,
        hostId: experience.hostId,
        price: experience.price,
        currency: experience.currency,
        neighborhood: experience.neighborhood,
        city: experience.city,
        country: experience.country,
      });
    }
  }

  console.log('✓ Created experiences');

  for (const host of HOSTS) {
    const primary = host.experiences[0];
    if (!primary) continue;
    await prisma.hostExperience.create({
      data: {
        id: primary.id,
        hostId: host.id,
        city: host.city,
        country: host.country,
        title: primary.title,
        shortDesc: primary.description,
        longDesc: primary.description,
        duration: primary.duration,
        price: primary.price,
        status: 'PUBLISHED',
        stops: {
          create: [
            {
              name: `${host.city} experience`,
              description: primary.description,
              address: host.city,
              lat: null,
              lng: null,
              order: 1,
            },
          ],
        },
      },
    });
  }

  const maria = HOSTS.find((host) => host.id === 'maria-rome');
  if (maria) {
    await prisma.experienceDraft.create({
      data: {
        id: 'draft-maria',
        userId: maria.id,
        title: 'Rome Market Morning',
        shortDesc: 'A relaxed market stroll with tastings and local tips.',
        longDesc: 'We meet at the market entrance and taste seasonal favorites while sharing stories about Roman food culture.',
        city: maria.city,
        country: maria.country,
        cityLat: 41.9028,
        cityLng: 12.4964,
        duration: 120,
        price: 6500,
        currency: 'USD',
        status: 'READY_TO_PUBLISH',
        stops: {
          create: [
            {
              name: 'Campo de’ Fiori',
              description: 'Fresh produce and local specialties.',
              address: 'Campo de’ Fiori',
              lat: 41.8956,
              lng: 12.4722,
              order: 1,
            },
            {
              name: 'Coffee stop',
              description: 'Quick espresso and a pastry.',
              address: 'Trastevere',
              lat: 41.89,
              lng: 12.47,
              order: 2,
            },
          ],
        },
      },
    });
  }

  console.log('✓ Created host experience + draft');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = 1; i <= 14; i++) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + i);

    for (const experience of experienceRecords.values()) {
      await prisma.experienceAvailability.create({
        data: {
          experienceId: experience.id,
          date: date,
          spotsLeft: 6,
        },
      });
    }
  }

  console.log('✓ Created availability');

  const tripStart = new Date();
  tripStart.setUTCHours(0, 0, 0, 0);
  tripStart.setUTCDate(tripStart.getUTCDate() + 7);
  const tripEnd = new Date(tripStart);
  tripEnd.setUTCDate(tripEnd.getUTCDate() + 2);

  const seedExperience = experienceRecords.get('1') ?? experienceRecords.values().next().value;
  if (!seedExperience) {
    throw new Error('No experiences found to seed a trip.');
  }
  const seedHostId = seedExperience.hostId;

  const trip = await prisma.trip.create({
    data: {
      id: 'trip-demo',
      userId: traveler.id,
      title: 'Rome Weekend',
      startDate: tripStart,
      endDate: tripEnd,
      status: 'DRAFT',
      stops: {
        create: [
          {
            city: seedExperience.city,
            country: seedExperience.country,
            lat: 41.9028,
            lng: 12.4964,
            order: 0,
            days: {
              create: [
                {
                  dayIndex: 1,
                  date: tripStart,
                  title: seedExperience.city,
                  items: {
                    create: [
                      {
                        type: 'EXPERIENCE',
                        title: 'Seeded Experience',
                        description: 'Seeded itinerary item for booking flow testing.',
                        experienceId: seedExperience.id,
                        hostId: seedHostId,
                        locationName: seedExperience.neighborhood,
                        lat: 41.9028,
                        lng: 12.4964,
                        orderIndex: 0,
                        createdByAI: false,
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    include: {
      stops: {
        include: {
          days: {
            include: {
              items: true,
            },
          },
        },
      },
    },
  });

  const tripItem = trip.stops[0]?.days[0]?.items[0];
  if (!tripItem) {
    throw new Error('Seed trip item was not created');
  }

  const baseAmount = seedExperience.price * 2;

  await prisma.booking.create({
    data: {
      tripId: trip.id,
      itemId: tripItem.id,
      experienceId: seedExperience.id,
      guestId: traveler.id,
      hostId: seedHostId,
      date: tripStart,
      guests: 2,
      totalPrice: baseAmount,
      amountSubtotal: baseAmount,
      currency: seedExperience.currency,
      status: 'TENTATIVE',
      paymentStatus: 'PENDING',
      chatUnlocked: false,
    },
  });

  const confirmedBooking = await prisma.booking.create({
    data: {
      experienceId: seedExperience.id,
      guestId: traveler.id,
      hostId: seedHostId,
      date: new Date(tripStart.getTime() + 24 * 60 * 60 * 1000),
      guests: 2,
      totalPrice: baseAmount,
      amountSubtotal: baseAmount,
      platformFee: Math.round(baseAmount * 0.1),
      hostNetAmount: baseAmount - Math.round(baseAmount * 0.1),
      currency: seedExperience.currency,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      chatUnlocked: true,
    },
  });

  await prisma.message.createMany({
    data: [
      {
        bookingId: confirmedBooking.id,
        senderId: traveler.id,
        content: 'Hi! Excited to meet. Any prep needed?',
      },
      {
        bookingId: confirmedBooking.id,
        senderId: seedHostId,
        content: 'So happy to host you! Just bring your appetite.',
      },
    ],
  });

  console.log('✓ Created trip, bookings, and messages');

  await prisma.review.create({
    data: {
      bookingId: confirmedBooking.id,
      experienceId: seedExperience.id,
      reviewerId: traveler.id,
      revieweeId: seedHostId,
      type: 'GUEST_TO_HOST',
      rating: 5,
      content: 'Fantastic experience! Highly recommended.',
    },
  });

  await prisma.review.create({
    data: {
      bookingId: confirmedBooking.id,
      experienceId: seedExperience.id,
      reviewerId: seedHostId,
      revieweeId: traveler.id,
      type: 'HOST_TO_GUEST',
      rating: 5,
      content: 'Wonderful guest. Would host again!',
    },
  });

  console.log('✓ Created sample reviews');

  console.log('');
  console.log('🎉 Seeding complete!');
  console.log('');
  console.log('Demo credentials:');
  console.log('  Host example: maria-rome@localhost.com / password');
  console.log('  Guest: guest@localhost.com / password');
  console.log('  Demo: demo@localhost.com / password');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
