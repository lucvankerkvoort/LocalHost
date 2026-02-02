/**
 * Backfill Script: Create Experience rows for existing HostExperience records
 * 
 * Purpose: Sync existing HostExperience records to the Experience table
 * so that /api/host/availability can find them.
 * 
 * Run with: npx ts-node scripts/backfill-marketplace-experiences.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
});

async function main() {
  console.log('🔄 Backfilling Experience rows for existing HostExperience records...\n');

  // Find all HostExperience records
  const hostExperiences = await prisma.hostExperience.findMany({
    include: {
      host: true,
    },
  });

  console.log(`Found ${hostExperiences.length} HostExperience record(s).\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const he of hostExperiences) {
    // Check if Experience already exists with same ID
    const existing = await prisma.experience.findUnique({
      where: { id: he.id },
    });

    if (existing) {
      console.log(`  ⏭️  Skipped: ${he.title} (Experience already exists)`);
      skipped++;
      continue;
    }

    try {
      await prisma.experience.create({
        data: {
          id: he.id, // Use same ID as HostExperience
          hostId: he.hostId,
          title: he.title,
          description: he.longDesc || he.shortDesc || 'Experience description',
          category: 'ARTS_CULTURE', // Default category
          neighborhood: he.city, // Use city as neighborhood
          city: he.city,
          country: he.country || 'Unknown',
          duration: he.duration,
          minGroupSize: 1,
          maxGroupSize: 6,
          price: 5000, // Default price in cents ($50)
          currency: 'USD',
          includedItems: [],
          excludedItems: [],
          photos: [],
          rating: 0,
          reviewCount: 0,
          isActive: he.status === 'PUBLISHED',
          latitude: null,
          longitude: null,
        },
      });

      console.log(`  ✅ Created: ${he.title} (ID: ${he.id})`);
      created++;
    } catch (error) {
      console.error(`  ❌ Failed: ${he.title} - ${error}`);
      failed++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed:  ${failed}`);
  console.log('\n✅ Backfill complete!');
}

main()
  .catch((error) => {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
