/**
 * Verify Staging Database Integrity
 * 
 * Checks that all E2E actors, experiences, and scenarios exist.
 * Run after seeding to confirm data integrity.
 * 
 * Usage:
 *   npm run db:verify:staging
 */
import dotenv from 'dotenv';
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env.staging' });

import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({
  // @ts-ignore - accelerateUrl is needed for Prisma Accelerate
  accelerateUrl: databaseUrl,
});

// Expected E2E data
const EXPECTED_ACTORS = [
  'e2e-traveler-full-access',
  'e2e-host-full-access',
  'e2e-host-and-traveler',
  'e2e-admin-debug',
];

const EXPECTED_EXPERIENCES = [
  'exp-e2e-rome-food-tour',
  'exp-e2e-barcelona-art-walk',
];

const EXPECTED_SCENARIOS = {
  bookings: ['booking-e2e-happy-path', 'booking-e2e-messaging'],
  trips: ['trip-e2e-dual-role'],
};

interface VerificationResult {
  category: string;
  item: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

async function verify(): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  
  console.log('\n🔍 Verifying E2E Staging Database\n');
  
  // Verify actors
  console.log('Checking actors...');
  for (const actorId of EXPECTED_ACTORS) {
    const user = await prisma.user.findUnique({
      where: { id: actorId },
    });
    
    if (!user) {
      results.push({ category: 'Actor', item: actorId, status: 'FAIL', details: 'Not found' });
    } else if (!user.isVerified) {
      results.push({ category: 'Actor', item: actorId, status: 'FAIL', details: 'Not verified' });
    } else if (user.isHost && !user.chargesEnabled) {
      results.push({ category: 'Actor', item: actorId, status: 'FAIL', details: 'Host without charges enabled' });
    } else {
      results.push({ category: 'Actor', item: actorId, status: 'PASS' });
    }
  }
  
  // Verify experiences
  console.log('Checking experiences...');
  for (const expId of EXPECTED_EXPERIENCES) {
    const exp = await prisma.experience.findUnique({
      where: { id: expId },
      include: { availability: true },
    });
    
    if (!exp) {
      results.push({ category: 'Experience', item: expId, status: 'FAIL', details: 'Not found' });
    } else if (!exp.isActive) {
      results.push({ category: 'Experience', item: expId, status: 'FAIL', details: 'Not active' });
    } else if (exp.availability.length < 30) {
      results.push({ 
        category: 'Experience', 
        item: expId, 
        status: 'FAIL', 
        details: `Only ${exp.availability.length} availability slots (expected 30+)` 
      });
    } else {
      results.push({ category: 'Experience', item: expId, status: 'PASS', details: `${exp.availability.length} slots` });
    }
  }
  
  // Verify bookings
  console.log('Checking booking scenarios...');
  for (const bookingId of EXPECTED_SCENARIOS.bookings) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { messages: true },
    });
    
    if (!booking) {
      results.push({ category: 'Booking', item: bookingId, status: 'FAIL', details: 'Not found' });
    } else {
      const details = `${booking.status} | chat=${booking.chatUnlocked} | msgs=${booking.messages.length}`;
      results.push({ category: 'Booking', item: bookingId, status: 'PASS', details });
    }
  }
  
  // Verify trips
  console.log('Checking trip scenarios...');
  for (const tripId of EXPECTED_SCENARIOS.trips) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { stops: { include: { days: { include: { items: true } } } } },
    });
    
    if (!trip) {
      results.push({ category: 'Trip', item: tripId, status: 'FAIL', details: 'Not found' });
    } else {
      const itemCount = trip.stops.flatMap(s => s.days.flatMap(d => d.items)).length;
      results.push({ category: 'Trip', item: tripId, status: 'PASS', details: `${itemCount} items` });
    }
  }
  
  return results;
}

async function main() {
  const results = await verify();
  
  console.log('\n📋 Verification Results\n');
  console.log('─'.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS');
  const failed = results.filter(r => r.status === 'FAIL');
  
  for (const result of results) {
    const icon = result.status === 'PASS' ? '✅' : '❌';
    const details = result.details ? ` (${result.details})` : '';
    console.log(`${icon} [${result.category}] ${result.item}${details}`);
  }
  
  console.log('─'.repeat(60));
  console.log(`\nTotal: ${results.length} | Passed: ${passed.length} | Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log('\n❌ Verification FAILED. Run `npm run db:seed:staging` to fix.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All verifications PASSED. Staging database is ready for E2E tests.\n');
    process.exit(0);
  }
}

main()
  .catch((e) => {
    console.error('Error during verification:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
