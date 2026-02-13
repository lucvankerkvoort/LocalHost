import 'dotenv/config';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { BookingStatus, ExperienceCategory, Prisma, PrismaClient, SyntheticResponseStyle, StripeOnboardingStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { HOSTS } from '../src/lib/data/hosts';
import { getCityCoordinates } from '../src/lib/data/city-coordinates';
import { summarizeSeedDistribution, validateSeedDistribution } from '../src/lib/synthetic-bots/seed-distribution';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the seed script.');
}

const prisma = new PrismaClient({
  accelerateUrl: databaseUrl,
  log: ['info', 'warn', 'error'],
});

type SeedProfile = 'dev-lite' | 'demo-rich' | 'staging-e2e';

type ProfileConfig = {
  syntheticHosts: number;
  experiences: number;
  availabilityDays: number;
  syntheticTravelers: number;
  trips: number;
  bookings: number;
  messagesPerBooking: number;
};

const PROFILE_CONFIG: Record<Exclude<SeedProfile, 'staging-e2e'>, ProfileConfig> = {
  'dev-lite': {
    syntheticHosts: 30,
    experiences: 90,
    availabilityDays: 30,
    syntheticTravelers: 25,
    trips: 40,
    bookings: 180,
    messagesPerBooking: 4,
  },
  'demo-rich': {
    syntheticHosts: 250,
    experiences: 750,
    availabilityDays: 90,
    syntheticTravelers: 120,
    trips: 200,
    bookings: 1500,
    messagesPerBooking: 4,
  },
};

const RESERVED_DOMAIN = 'synthetic.localhost.test';

const RESPONSE_STYLES: SyntheticResponseStyle[] = ['FRIENDLY', 'PROFESSIONAL', 'CONCISE', 'WARM'];
const ALL_CATEGORIES: ExperienceCategory[] = [
  'FOOD_DRINK',
  'ARTS_CULTURE',
  'OUTDOOR_ADVENTURE',
  'WELLNESS',
  'LEARNING',
  'NIGHTLIFE_SOCIAL',
  'FAMILY',
];

function stableId(prefix: string, seed: string): string {
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 16);
  return `${prefix}-${digest}`;
}

function requiredProfile(): SeedProfile {
  const raw = process.env.SYNTHETIC_BOTS_PROFILE;
  if (raw === 'dev-lite' || raw === 'demo-rich' || raw === 'staging-e2e') {
    return raw;
  }
  return 'dev-lite';
}

function hashInt(seed: string): number {
  return parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16);
}

function choosePrice(seed: string): number {
  const roll = hashInt(`${seed}:band`) % 100;
  if (roll < 35) {
    return 2500 + (hashInt(`${seed}:budget`) % 3500);
  }
  if (roll < 80) {
    return 6000 + (hashInt(`${seed}:mid`) % 7000);
  }
  return 13000 + (hashInt(`${seed}:premium`) % 12000);
}

function chooseRating(seed: string): number {
  const roll = hashInt(`${seed}:rating`) % 100;
  if (roll < 55) return 4.5 + ((hashInt(`${seed}:r1`) % 6) / 10);
  if (roll < 85) return 4.0 + ((hashInt(`${seed}:r2`) % 5) / 10);
  return 3.7 + ((hashInt(`${seed}:r3`) % 4) / 10);
}

function chooseReviewCount(seed: string): number {
  const roll = hashInt(`${seed}:reviews`) % 100;
  if (roll < 60) return 8 + (hashInt(`${seed}:small`) % 80);
  if (roll < 90) return 90 + (hashInt(`${seed}:mid`) % 180);
  return 280 + (hashInt(`${seed}:high`) % 520);
}

function chooseGuests(seed: string): number {
  return 1 + (hashInt(`${seed}:guests`) % 4);
}

function chooseBookingStatus(index: number): BookingStatus {
  const roll = index % 100;
  if (roll < 35) return 'TENTATIVE';
  if (roll < 80) return 'CONFIRMED';
  if (roll < 92) return 'COMPLETED';
  return 'CANCELLED';
}

function buildCategoryTitle(category: ExperienceCategory, city: string, hostName: string): string {
  switch (category) {
    case 'FOOD_DRINK':
      return `${city} Neighborhood Food Walk with ${hostName}`;
    case 'ARTS_CULTURE':
      return `${city} Local Arts and Storytelling Session`;
    case 'OUTDOOR_ADVENTURE':
      return `${city} Outdoor Discovery Route`;
    case 'WELLNESS':
      return `${city} Slow Morning Wellness Reset`;
    case 'LEARNING':
      return `${city} Practical Local Skills Workshop`;
    case 'NIGHTLIFE_SOCIAL':
      return `${city} Social Night Highlights with Locals`;
    case 'FAMILY':
      return `${city} Family-Friendly Neighborhood Adventure`;
    default:
      return `${city} Local Experience`; 
  }
}

function buildCategoryDescription(category: ExperienceCategory, city: string): string {
  switch (category) {
    case 'FOOD_DRINK':
      return `Taste seasonal specialties in ${city} with context on local food traditions.`;
    case 'ARTS_CULTURE':
      return `Explore overlooked cultural spots in ${city} with stories from local history.`;
    case 'OUTDOOR_ADVENTURE':
      return `Move through scenic routes in ${city} with flexible pacing and local tips.`;
    case 'WELLNESS':
      return `A restorative experience in ${city} focused on mindful movement and calm spaces.`;
    case 'LEARNING':
      return `Hands-on learning in ${city} with practical techniques you can take home.`;
    case 'NIGHTLIFE_SOCIAL':
      return `Discover social neighborhoods in ${city} while staying in safe, host-guided settings.`;
    case 'FAMILY':
      return `Kid-friendly stops in ${city} designed for shared discovery and easy logistics.`;
    default:
      return `A curated local experience in ${city}.`;
  }
}

function ensureCategoryCoverage(config: ProfileConfig) {
  if (config.experiences < ALL_CATEGORIES.length * 8) {
    throw new Error('Experience target is too small to satisfy category distribution constraints.');
  }
}

async function clearSyntheticDataset() {
  await prisma.syntheticReplyJob.deleteMany({
    where: {
      OR: [
        { bookingId: { startsWith: 'syn-booking-' } },
        { hostId: { startsWith: 'syn-host-' } },
        { triggerMessageId: { startsWith: 'syn-msg-' } },
      ],
    },
  });
  await prisma.message.deleteMany({ where: { id: { startsWith: 'syn-msg-' } } });
  await prisma.review.deleteMany({ where: { experienceId: { startsWith: 'syn-exp-' } } });
  await prisma.booking.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'syn-booking-' } },
        { experienceId: { startsWith: 'syn-exp-' } },
        { hostId: { startsWith: 'syn-host-' } },
        { guestId: { startsWith: 'syn-traveler-' } },
      ],
    },
  });
  await prisma.itineraryItem.deleteMany({
    where: { experienceId: { startsWith: 'syn-exp-' } },
  });
  await prisma.experienceAvailability.deleteMany({ where: { id: { startsWith: 'syn-avail-' } } });
  await prisma.trip.deleteMany({ where: { id: { startsWith: 'syn-trip-' } } });
  await prisma.experience.deleteMany({ where: { id: { startsWith: 'syn-exp-' } } });
  await prisma.user.deleteMany({
    where: {
      OR: [{ id: { startsWith: 'syn-host-' } }, { id: { startsWith: 'syn-traveler-' } }],
    },
  });
}

async function main() {
  const profile = requiredProfile();

  if (profile === 'staging-e2e') {
    console.log('➡️ SYNTHETIC_BOTS_PROFILE=staging-e2e selected, delegating to prisma/seed-staging.ts');
    const result = spawnSync('npx', ['tsx', 'prisma/seed-staging.ts'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DOTENV_CONFIG_PATH: process.env.DOTENV_CONFIG_PATH || '.env.staging',
      },
    });
    if (result.status !== 0) {
      throw new Error(`Staging seed delegation failed with exit code ${result.status ?? 'unknown'}`);
    }
    return;
  }

  const config = PROFILE_CONFIG[profile];
  ensureCategoryCoverage(config);

  console.log(`🌱 Seeding database with profile: ${profile}`);
  await clearSyntheticDataset();

  const password = await bcrypt.hash('password', 10);

  // Ensure Demo User
  const demoUserId = 'demo-user';
  const demoEmail = 'demo@localhost.com';
  const existingDemoByEmail = await prisma.user.findUnique({
    where: { email: demoEmail },
    select: { id: true },
  });

  if (existingDemoByEmail) {
    await prisma.user.update({
      where: { id: existingDemoByEmail.id },
      data: { password },
    });
  } else {
    const existingDemoById = await prisma.user.findUnique({
      where: { id: demoUserId },
      select: { id: true },
    });

    if (existingDemoById) {
      await prisma.user.update({
        where: { id: demoUserId },
        data: { email: demoEmail, password },
      });
    } else {
      await prisma.user.create({
        data: {
          id: demoUserId,
          email: demoEmail,
          password,
          name: 'Demo Traveler',
          city: 'San Francisco',
          country: 'USA',
          languages: ['English'],
          interests: ['travel', 'food'],
          bio: 'Demo user for testing.',
          isHost: false,
          isVerified: true,
          verificationTier: 'BASIC',
          trustScore: 100,
        },
      });
    }
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const stripeEnabled = profile === 'dev-lite';

  const hostRecords = Array.from({ length: config.syntheticHosts }, (_, i) => {
    const baseHost = HOSTS[i % HOSTS.length];
    const hostId = stableId('syn-host', `${profile}:host:${i}:${baseHost.id}`);
    const responseStyle = RESPONSE_STYLES[i % RESPONSE_STYLES.length];
    const latencyMin = 5 + (hashInt(`${hostId}:latency-min`) % 11);
    const latencyMax = latencyMin + 8 + (hashInt(`${hostId}:latency-max`) % 16);
    const stripeAccountId = stripeEnabled
      ? `acct_${createHash('sha256').update(hostId).digest('hex').slice(0, 16)}`
      : null;

    return {
      id: hostId,
      email: `host+${hostId}@${RESERVED_DOMAIN}`,
      name: `${baseHost.name} • Local Guide`,
      bio: baseHost.bio,
      quote: baseHost.quote,
      responseTime: baseHost.responseTime,
      image: baseHost.photo,
      city: baseHost.city,
      country: baseHost.country,
      languages: baseHost.languages,
      interests: baseHost.interests,
      responseStyle,
      latencyMin,
      latencyMax,
      personaKey: `${baseHost.id}:${responseStyle.toLowerCase()}`,
      stripeAccountId,
      stripeOnboardingStatus: stripeEnabled ? 'COMPLETE' : 'NOT_STARTED',
      payoutsEnabled: stripeEnabled,
      chargesEnabled: stripeEnabled,
    };
  });

  for (const host of hostRecords) {
    await prisma.user.upsert({
      where: { id: host.id },
      create: {
        id: host.id,
        email: host.email,
        password,
        name: host.name,
        bio: host.bio,
        quote: host.quote,
        responseTime: host.responseTime,
        image: host.image,
        city: host.city,
        country: host.country,
        languages: host.languages,
        interests: host.interests,
        isHost: true,
        isVerified: true,
        verificationTier: 'VERIFIED',
        trustScore: 75,
        isSyntheticHost: true,
        syntheticBotEnabled: true,
        syntheticPersonaKey: host.personaKey,
        syntheticResponseStyle: host.responseStyle,
        syntheticResponseLatencyMinSec: host.latencyMin,
        syntheticResponseLatencyMaxSec: host.latencyMax,
        stripeConnectedAccountId: host.stripeAccountId,
        stripeOnboardingStatus: host.stripeOnboardingStatus as StripeOnboardingStatus,
        payoutsEnabled: host.payoutsEnabled,
        chargesEnabled: host.chargesEnabled,
      },
      update: {
        email: host.email,
        name: host.name,
        bio: host.bio,
        quote: host.quote,
        responseTime: host.responseTime,
        image: host.image,
        city: host.city,
        country: host.country,
        languages: host.languages,
        interests: host.interests,
        isHost: true,
        isVerified: true,
        verificationTier: 'VERIFIED',
        trustScore: 75,
        isSyntheticHost: true,
        syntheticBotEnabled: true,
        syntheticPersonaKey: host.personaKey,
        syntheticResponseStyle: host.responseStyle,
        syntheticResponseLatencyMinSec: host.latencyMin,
        syntheticResponseLatencyMaxSec: host.latencyMax,
        stripeConnectedAccountId: host.stripeAccountId,
        stripeOnboardingStatus: host.stripeOnboardingStatus as StripeOnboardingStatus,
        payoutsEnabled: host.payoutsEnabled,
        chargesEnabled: host.chargesEnabled,
      },
    });
  }

  const travelerRecords = Array.from({ length: config.syntheticTravelers }, (_, i) => {
    const baseHost = HOSTS[(i + 7) % HOSTS.length];
    const travelerId = stableId('syn-traveler', `${profile}:traveler:${i}:${baseHost.id}`);
    return {
      id: travelerId,
      email: `traveler+${travelerId}@${RESERVED_DOMAIN}`,
      name: `Traveler ${i + 1}`,
      city: baseHost.city,
      country: baseHost.country,
      languages: ['English', ...baseHost.languages].slice(0, 3),
      interests: baseHost.interests.slice(0, 4),
    };
  });

  for (const traveler of travelerRecords) {
    await prisma.user.upsert({
      where: { id: traveler.id },
      create: {
        id: traveler.id,
        email: traveler.email,
        password,
        name: traveler.name,
        city: traveler.city,
        country: traveler.country,
        languages: traveler.languages,
        interests: traveler.interests,
        bio: 'Synthetic traveler profile for realistic marketplace activity.',
        isHost: false,
        isVerified: true,
        verificationTier: 'BASIC',
        trustScore: 35,
      },
      update: {
        email: traveler.email,
        name: traveler.name,
        city: traveler.city,
        country: traveler.country,
        languages: traveler.languages,
        interests: traveler.interests,
        bio: 'Synthetic traveler profile for realistic marketplace activity.',
        isHost: false,
        isVerified: true,
        verificationTier: 'BASIC',
        trustScore: 35,
      },
    });
  }

  const experienceRecords = Array.from({ length: config.experiences }, (_, i) => {
    const host = hostRecords[i % hostRecords.length];
    const category = ALL_CATEGORIES[i % ALL_CATEGORIES.length];
    const id = stableId('syn-exp', `${profile}:experience:${i}:${host.id}:${category}`);
    const price = choosePrice(id);
    const coords = getCityCoordinates(host.city);

    return {
      id,
      hostId: host.id,
      city: host.city,
      country: host.country,
      category,
      title: buildCategoryTitle(category, host.city, host.name.split(' • ')[0] ?? host.name),
      description: buildCategoryDescription(category, host.city),
      duration: 90 + (hashInt(`${id}:duration`) % 180),
      price,
      rating: Number(chooseRating(id).toFixed(1)),
      reviewCount: chooseReviewCount(id),
      photos: [`https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=500&fit=crop&sig=${i + 1}`],
      includedItems: ['Host guidance', 'Local recommendations'],
      excludedItems: ['Transportation', 'Personal shopping'],
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
    };
  });

  for (const experience of experienceRecords) {
    await prisma.experience.upsert({
      where: { id: experience.id },
      create: {
        id: experience.id,
        hostId: experience.hostId,
        title: experience.title,
        description: experience.description,
        category: experience.category,
        neighborhood: experience.city,
        city: experience.city,
        country: experience.country,
        duration: experience.duration,
        minGroupSize: 1,
        maxGroupSize: 8,
        price: experience.price,
        currency: 'USD',
        includedItems: experience.includedItems,
        excludedItems: experience.excludedItems,
        photos: experience.photos,
        rating: experience.rating,
        reviewCount: experience.reviewCount,
        latitude: experience.latitude ?? null,
        longitude: experience.longitude ?? null,
        isActive: true,
      },
      update: {
        hostId: experience.hostId,
        title: experience.title,
        description: experience.description,
        category: experience.category,
        neighborhood: experience.city,
        city: experience.city,
        country: experience.country,
        duration: experience.duration,
        minGroupSize: 1,
        maxGroupSize: 8,
        price: experience.price,
        currency: 'USD',
        includedItems: experience.includedItems,
        excludedItems: experience.excludedItems,
        photos: experience.photos,
        rating: experience.rating,
        reviewCount: experience.reviewCount,
        latitude: experience.latitude ?? null,
        longitude: experience.longitude ?? null,
        isActive: true,
      },
    });
  }

  const availabilityData: Prisma.ExperienceAvailabilityCreateManyInput[] = [];
  for (const experience of experienceRecords) {
    for (let dayOffset = 1; dayOffset <= config.availabilityDays; dayOffset++) {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() + dayOffset);
      const dateKey = date.toISOString().slice(0, 10);
      const availabilityId = stableId('syn-avail', `${experience.id}:${dateKey}`);

      availabilityData.push({
        id: availabilityId,
        experienceId: experience.id,
        date,
        spotsLeft: 2 + (hashInt(`${availabilityId}:spots`) % 7),
        timezone: 'UTC',
      });
    }
  }

  const BATCH_SIZE = 2000;
  for (let i = 0; i < availabilityData.length; i += BATCH_SIZE) {
    console.log(`Seeding availability batch ${i / BATCH_SIZE + 1}...`);
    await prisma.experienceAvailability.createMany({
      data: availabilityData.slice(i, i + BATCH_SIZE),
      skipDuplicates: true,
    });
  }

  const tripRecords = Array.from({ length: config.trips }, (_, i) => {
    const id = stableId('syn-trip', `${profile}:trip:${i}`);
    const startDate = new Date(today);
    startDate.setUTCDate(today.getUTCDate() + (i % 50) + 3);
    const endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + (2 + (i % 4)));

    return {
      id,
      userId: travelerRecords[i % travelerRecords.length]?.id,
      title: `Synthetic Trip ${i + 1}`,
      status: i % 3 === 0 ? 'PLANNED' as const : 'DRAFT' as const,
      startDate,
      endDate,
    };
  }).filter((trip) => Boolean(trip.userId));

  for (const trip of tripRecords) {
    await prisma.trip.upsert({
      where: { id: trip.id },
      create: {
        id: trip.id,
        userId: trip.userId!,
        title: trip.title,
        status: trip.status,
        startDate: trip.startDate,
        endDate: trip.endDate,
      },
      update: {
        userId: trip.userId!,
        title: trip.title,
        status: trip.status,
        startDate: trip.startDate,
        endDate: trip.endDate,
      },
    });
  }

  const bookingRecords = Array.from({ length: config.bookings }, (_, i) => {
    const id = stableId('syn-booking', `${profile}:booking:${i}`);
    const experience = experienceRecords[i % experienceRecords.length];
    const traveler = travelerRecords[i % travelerRecords.length];
    const trip = tripRecords[i % tripRecords.length];
    const status = chooseBookingStatus(i);

    const bookingDate = new Date(today);
    bookingDate.setUTCDate(today.getUTCDate() + ((i % config.availabilityDays) + 1));
    if (status === 'COMPLETED') {
      bookingDate.setUTCDate(today.getUTCDate() - ((i % 20) + 1));
    }

    const guests = chooseGuests(id);
    const amountSubtotal = experience.price * guests;
    const platformFee = status === 'CONFIRMED' || status === 'COMPLETED' ? Math.round(amountSubtotal * 0.1) : 0;
    const hostNetAmount = amountSubtotal - platformFee;

    return {
      id,
      tripId: trip?.id ?? null,
      experienceId: experience.id,
      hostId: experience.hostId,
      guestId: traveler.id,
      date: bookingDate,
      guests,
      amountSubtotal,
      platformFee,
      hostNetAmount,
      status,
      paymentStatus: status === 'CONFIRMED' || status === 'COMPLETED' ? 'PAID' as const : 'PENDING' as const,
      chatUnlocked: status === 'CONFIRMED' || status === 'COMPLETED',
    };
  });

  for (const booking of bookingRecords) {
    await prisma.booking.upsert({
      where: { id: booking.id },
      create: {
        id: booking.id,
        tripId: booking.tripId,
        experienceId: booking.experienceId,
        hostId: booking.hostId,
        guestId: booking.guestId,
        date: booking.date,
        guests: booking.guests,
        totalPrice: booking.amountSubtotal,
        amountSubtotal: booking.amountSubtotal,
        platformFee: booking.platformFee,
        hostNetAmount: booking.hostNetAmount,
        currency: 'USD',
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        chatUnlocked: booking.chatUnlocked,
      },
      update: {
        tripId: booking.tripId,
        experienceId: booking.experienceId,
        hostId: booking.hostId,
        guestId: booking.guestId,
        date: booking.date,
        guests: booking.guests,
        totalPrice: booking.amountSubtotal,
        amountSubtotal: booking.amountSubtotal,
        platformFee: booking.platformFee,
        hostNetAmount: booking.hostNetAmount,
        currency: 'USD',
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        chatUnlocked: booking.chatUnlocked,
      },
    });
  }

  const messageRows: Array<{ id: string; bookingId: string; senderId: string; content: string }> = [];
  for (const booking of bookingRecords) {
    const messageSeeds = [
      `Hi! Looking forward to this experience.`,
      `Thanks for the note. I am the Localhost automated host assistant and I can help with logistics.`,
      `Great, could you confirm timing and meeting point?`,
      `Absolutely. I will keep all updates in this booking thread and share details here.`,
    ];

    for (let i = 0; i < config.messagesPerBooking; i++) {
      const messageId = stableId('syn-msg', `${booking.id}:message:${i}`);
      const senderId = i % 2 === 0 ? booking.guestId : booking.hostId;
      const content = `${messageSeeds[i % messageSeeds.length]} [ref:${booking.id.slice(0, 8)}-${i + 1}]`;
      messageRows.push({
        id: messageId,
        bookingId: booking.id,
        senderId,
        content,
      });
    }
  }

  for (const message of messageRows) {
    await prisma.message.upsert({
      where: { id: message.id },
      create: message,
      update: message,
    });
  }

  const distributionSummary = summarizeSeedDistribution(
    experienceRecords.map((experience) => ({
      city: experience.city,
      category: experience.category,
      price: experience.price,
    }))
  );
  const distributionErrors = validateSeedDistribution(distributionSummary);
  if (distributionErrors.length > 0) {
    throw new Error(`Seed distribution validation failed:\n- ${distributionErrors.join('\n- ')}`);
  }

  const seededCounts = {
    syntheticHosts: await prisma.user.count({ where: { isSyntheticHost: true } }),
    experiences: await prisma.experience.count({ where: { id: { startsWith: 'syn-exp-' } } }),
    availability: await prisma.experienceAvailability.count({ where: { id: { startsWith: 'syn-avail-' } } }),
    syntheticTravelers: await prisma.user.count({ where: { id: { startsWith: 'syn-traveler-' } } }),
    trips: await prisma.trip.count({ where: { id: { startsWith: 'syn-trip-' } } }),
    bookings: await prisma.booking.count({ where: { id: { startsWith: 'syn-booking-' } } }),
    messages: await prisma.message.count({ where: { id: { startsWith: 'syn-msg-' } } }),
  };

  if (profile === 'demo-rich') {
    if (seededCounts.syntheticHosts < 250) throw new Error('demo-rich seed minimum failed: syntheticHosts < 250');
    if (seededCounts.experiences < 750) throw new Error('demo-rich seed minimum failed: experiences < 750');
    if (seededCounts.syntheticTravelers < 120) throw new Error('demo-rich seed minimum failed: syntheticTravelers < 120');
    if (seededCounts.trips < 200) throw new Error('demo-rich seed minimum failed: trips < 200');
    if (seededCounts.bookings < 1500) throw new Error('demo-rich seed minimum failed: bookings < 1500');
    if (seededCounts.messages < 6000) throw new Error('demo-rich seed minimum failed: messages < 6000');
  }

  console.log('✅ Seed complete');
  console.log(JSON.stringify({ profile, seededCounts, maxCityShare: distributionSummary.maxCityShare }, null, 2));
}

main()
  .catch((error) => {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
