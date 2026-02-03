/**
 * E2E Staging Seed Script
 * 
 * Seeds deterministic data for E2E testing.
 * Creates named actors and scenarios that tests can reference by ID.
 * 
 * Usage:
 *   npm run db:seed:staging
 */
import dotenv from 'dotenv';
// Load staging environment (or fall back to checking DOTENV_CONFIG_PATH)
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env.staging' });

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the seed script.');
}

const prisma = new PrismaClient({
  // @ts-ignore - accelerateUrl is needed for Prisma Accelerate
  accelerateUrl: databaseUrl,
  log: ['info', 'warn', 'error'],
});

// =============================================================================
// E2E ACTORS - Named users with deterministic IDs
// =============================================================================

interface E2EActor {
  id: string;
  email: string;
  password: string;
  name: string;
  isHost: boolean;
  isTraveler: boolean;
  bio: string;
  city: string;
  country: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const E2E_PASSWORDS = {
  TRAVELER: requiredEnv('E2E_TRAVELER_PASSWORD'),
  HOST: requiredEnv('E2E_HOST_PASSWORD'),
  DUAL: requiredEnv('E2E_DUAL_PASSWORD'),
  ADMIN: requiredEnv('E2E_ADMIN_PASSWORD'),
} as const;

const E2E_ACTORS: E2EActor[] = [
  {
    id: 'e2e-traveler-full-access',
    email: 'traveler@e2e.localhost',
    password: E2E_PASSWORDS.TRAVELER,
    name: 'E2E Traveler',
    isHost: false,
    isTraveler: true,
    bio: 'Full access traveler for E2E testing. Can book, chat, and manage trips.',
    city: 'New York',
    country: 'USA',
  },
  {
    id: 'e2e-host-full-access',
    email: 'host@e2e.localhost',
    password: E2E_PASSWORDS.HOST,
    name: 'E2E Host',
    isHost: true,
    isTraveler: false,
    bio: 'Full access host for E2E testing. Can create experiences, accept bookings, and chat.',
    city: 'Rome',
    country: 'Italy',
  },
  {
    id: 'e2e-host-and-traveler',
    email: 'dual@e2e.localhost',
    password: E2E_PASSWORDS.DUAL,
    name: 'E2E Dual Role',
    isHost: true,
    isTraveler: true,
    bio: 'Dual role user for E2E testing. Can act as both host and traveler.',
    city: 'Barcelona',
    country: 'Spain',
  },
  {
    id: 'e2e-admin-debug',
    email: 'admin@e2e.localhost',
    password: E2E_PASSWORDS.ADMIN,
    name: 'E2E Admin',
    isHost: true,
    isTraveler: true,
    bio: 'Admin user for E2E testing and debugging.',
    city: 'San Francisco',
    country: 'USA',
  },
];

// =============================================================================
// E2E EXPERIENCES - Named experiences with deterministic IDs
// =============================================================================

interface E2EExperience {
  id: string;
  hostId: string;
  title: string;
  description: string;
  category: 'FOOD_DRINK' | 'ARTS_CULTURE' | 'OUTDOOR_ADVENTURE' | 'WELLNESS' | 'LEARNING' | 'NIGHTLIFE_SOCIAL' | 'FAMILY';
  city: string;
  country: string;
  duration: number;
  price: number;
}

const E2E_EXPERIENCES: E2EExperience[] = [
  {
    id: 'exp-e2e-rome-food-tour',
    hostId: 'e2e-host-full-access',
    title: 'E2E Rome Food Tour',
    description: 'A deterministic food tour for E2E testing. Visit local markets and taste authentic Roman cuisine.',
    category: 'FOOD_DRINK',
    city: 'Rome',
    country: 'Italy',
    duration: 180,
    price: 7500, // $75
  },
  {
    id: 'exp-e2e-barcelona-art-walk',
    hostId: 'e2e-host-and-traveler',
    title: 'E2E Barcelona Art Walk',
    description: 'A deterministic art tour for E2E testing. Explore Gaudí and modern street art.',
    category: 'ARTS_CULTURE',
    city: 'Barcelona',
    country: 'Spain',
    duration: 150,
    price: 6000, // $60
  },
];

// =============================================================================
// E2E SCENARIOS - Named test scenarios with deterministic IDs
// =============================================================================

const E2E_SCENARIO_IDS = {
  HAPPY_PATH_BOOKING: 'booking-e2e-happy-path',
  MESSAGING_ENABLED: 'booking-e2e-messaging',
  DUAL_ROLE_TRIP: 'trip-e2e-dual-role',
};

// =============================================================================
// SEED FUNCTIONS
// =============================================================================

async function clearDatabase() {
  console.log('🧹 Clearing E2E data only (preserving dev data)...');
  
  // Only delete E2E-specific records (prefixed with e2e- or booking-e2e- etc.)
  // This preserves existing development data
  
  // Delete E2E messages (via bookings)
  await prisma.message.deleteMany({
    where: {
      booking: {
        id: { startsWith: 'booking-e2e' }
      }
    }
  });
  
  // Delete E2E bookings
  await prisma.booking.deleteMany({
    where: {
      id: { startsWith: 'booking-e2e' }
    }
  });
  
  // Delete E2E trips and related data
  const e2eTrips = await prisma.trip.findMany({
    where: { id: { startsWith: 'trip-e2e' } },
    include: { stops: { include: { days: { include: { items: true } } } } }
  });
  
  for (const trip of e2eTrips) {
    for (const stop of trip.stops) {
      for (const day of stop.days) {
        await prisma.itineraryItem.deleteMany({ where: { dayId: day.id } });
      }
      await prisma.itineraryDay.deleteMany({ where: { tripStopId: stop.id } });
    }
    await prisma.tripStop.deleteMany({ where: { tripId: trip.id } });
  }
  await prisma.trip.deleteMany({ where: { id: { startsWith: 'trip-e2e' } } });
  
  // Delete E2E availability
  await prisma.experienceAvailability.deleteMany({
    where: {
      experience: {
        id: { startsWith: 'exp-e2e' }
      }
    }
  });
  
  // Delete E2E host experiences
  await prisma.hostExperience.deleteMany({
    where: { id: { startsWith: 'hosted-exp-e2e' } }
  });
  
  // Delete E2E experiences
  await prisma.experience.deleteMany({
    where: { id: { startsWith: 'exp-e2e' } }
  });
  
  // Delete E2E users
  await prisma.user.deleteMany({
    where: { id: { startsWith: 'e2e-' } }
  });
  
  console.log('✓ E2E data cleared (dev data preserved)');
}

async function seedActors() {
  console.log('👤 Seeding E2E actors...');
  
  for (const actor of E2E_ACTORS) {
    const hashedPassword = await bcrypt.hash(actor.password, 10);
    
    await prisma.user.create({
      data: {
        id: actor.id,
        email: actor.email,
        password: hashedPassword,
        name: actor.name,
        bio: actor.bio,
        city: actor.city,
        country: actor.country,
        languages: ['English'],
        interests: ['Travel', 'Testing'],
        isHost: actor.isHost,
        isVerified: true,
        verificationTier: 'VERIFIED',
        trustScore: 100,
        // Host-specific fields (fully enabled for E2E)
        stripeConnectedAccountId: actor.isHost ? `acct_e2e_${actor.id}` : null,
        stripeOnboardingStatus: actor.isHost ? 'COMPLETE' : 'NOT_STARTED',
        payoutsEnabled: actor.isHost,
        chargesEnabled: actor.isHost,
      },
    });
  }
  
  console.log(`✓ Created ${E2E_ACTORS.length} E2E actors`);
}

async function seedExperiences() {
  console.log('🎯 Seeding E2E experiences...');
  
  for (const exp of E2E_EXPERIENCES) {
    await prisma.experience.create({
      data: {
        id: exp.id,
        hostId: exp.hostId,
        title: exp.title,
        description: exp.description,
        category: exp.category,
        neighborhood: exp.city,
        city: exp.city,
        country: exp.country,
        duration: exp.duration,
        minGroupSize: 1,
        maxGroupSize: 6,
        price: exp.price,
        currency: 'USD',
        includedItems: ['Food', 'Drinks', 'Local Guide'],
        excludedItems: ['Transportation'],
        photos: [],
        rating: 4.9,
        reviewCount: 25,
        isActive: true,
      },
    });
    
    // Also create HostExperience record
    await prisma.hostExperience.create({
      data: {
        id: `hosted-${exp.id}`,
        hostId: exp.hostId,
        city: exp.city,
        country: exp.country,
        title: exp.title,
        shortDesc: exp.description,
        longDesc: exp.description,
        duration: exp.duration,
        price: exp.price,
        status: 'PUBLISHED',
      },
    });
  }
  
  console.log(`✓ Created ${E2E_EXPERIENCES.length} E2E experiences`);
}

async function seedAvailability() {
  console.log('📅 Seeding 30-day availability...');
  
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  
  let count = 0;
  
  for (let i = 1; i <= 30; i++) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + i);
    
    for (const exp of E2E_EXPERIENCES) {
      await prisma.experienceAvailability.create({
        data: {
          experienceId: exp.id,
          date: date,
          spotsLeft: 6,
          timezone: 'Europe/Rome',
        },
      });
      count++;
    }
  }
  
  console.log(`✓ Created ${count} availability slots (30 days × ${E2E_EXPERIENCES.length} experiences)`);
}

async function seedScenarios() {
  console.log('🎬 Seeding E2E scenarios...');
  
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  
  const bookingDate = new Date(today);
  bookingDate.setUTCDate(today.getUTCDate() + 7);
  
  // Scenario 1: Happy Path Booking (TENTATIVE)
  await prisma.booking.create({
    data: {
      id: E2E_SCENARIO_IDS.HAPPY_PATH_BOOKING,
      experienceId: 'exp-e2e-rome-food-tour',
      guestId: 'e2e-traveler-full-access',
      hostId: 'e2e-host-full-access',
      date: bookingDate,
      guests: 2,
      totalPrice: 15000, // $150 for 2 guests
      amountSubtotal: 15000,
      platformFee: 0,
      hostNetAmount: 0,
      currency: 'USD',
      status: 'TENTATIVE',
      paymentStatus: 'PENDING',
      chatUnlocked: false,
    },
  });
  
  // Scenario 2: Messaging Enabled (CONFIRMED with chat)
  const messagingBookingDate = new Date(bookingDate);
  messagingBookingDate.setUTCDate(bookingDate.getUTCDate() + 1);
  
  await prisma.booking.create({
    data: {
      id: E2E_SCENARIO_IDS.MESSAGING_ENABLED,
      experienceId: 'exp-e2e-rome-food-tour',
      guestId: 'e2e-traveler-full-access',
      hostId: 'e2e-host-full-access',
      date: messagingBookingDate,
      guests: 2,
      totalPrice: 15000,
      amountSubtotal: 15000,
      platformFee: 1500,
      hostNetAmount: 13500,
      currency: 'USD',
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      chatUnlocked: true,
    },
  });
  
  // Seed messages for messaging scenario
  await prisma.message.createMany({
    data: [
      {
        bookingId: E2E_SCENARIO_IDS.MESSAGING_ENABLED,
        senderId: 'e2e-traveler-full-access',
        content: 'Hi! Looking forward to the tour. Any dietary restrictions I should mention?',
        isRead: true,
      },
      {
        bookingId: E2E_SCENARIO_IDS.MESSAGING_ENABLED,
        senderId: 'e2e-host-full-access',
        content: 'Welcome! No problem, we can accommodate any dietary needs. Just let me know!',
        isRead: false,
      },
    ],
  });
  
  // Scenario 3: Dual Role Trip (host_and_traveler as guest)
  const dualRoleTripStart = new Date(bookingDate);
  dualRoleTripStart.setUTCDate(bookingDate.getUTCDate() + 14);
  
  await prisma.trip.create({
    data: {
      id: E2E_SCENARIO_IDS.DUAL_ROLE_TRIP,
      userId: 'e2e-host-and-traveler',
      title: 'E2E Dual Role Trip',
      status: 'DRAFT',
      startDate: dualRoleTripStart,
      endDate: new Date(dualRoleTripStart.getTime() + 3 * 24 * 60 * 60 * 1000),
      stops: {
        create: [
          {
            city: 'Rome',
            country: 'Italy',
            lat: 41.9028,
            lng: 12.4964,
            order: 0,
            days: {
              create: [
                {
                  dayIndex: 1,
                  date: dualRoleTripStart,
                  title: 'Exploring Rome',
                  items: {
                    create: [
                      {
                        type: 'EXPERIENCE',
                        title: 'E2E Rome Food Tour',
                        description: 'Booked experience for dual role testing',
                        experienceId: 'exp-e2e-rome-food-tour',
                        hostId: 'e2e-host-full-access',
                        locationName: 'Rome',
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
  });
  
  console.log('✓ Created 3 E2E scenarios: happy_path_booking, messaging_enabled, dual_role_trip');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('');
  console.log('🌱 E2E STAGING SEED SCRIPT');
  console.log('==========================');
  console.log('');
  
  await clearDatabase();
  await seedActors();
  await seedExperiences();
  await seedAvailability();
  await seedScenarios();
  
  console.log('');
  console.log('🎉 E2E Staging seed complete!');
  console.log('');
  console.log('E2E Actor Credential Vars:');
  console.log('  Traveler: traveler@e2e.localhost / E2E_TRAVELER_PASSWORD');
  console.log('  Host:     host@e2e.localhost / E2E_HOST_PASSWORD');
  console.log('  Dual:     dual@e2e.localhost / E2E_DUAL_PASSWORD');
  console.log('  Admin:    admin@e2e.localhost / E2E_ADMIN_PASSWORD');
  console.log('');
  console.log('E2E Scenarios:');
  console.log('  Happy Path Booking: booking-e2e-happy-path');
  console.log('  Messaging Enabled:  booking-e2e-messaging');
  console.log('  Dual Role Trip:     trip-e2e-dual-role');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding E2E staging database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
