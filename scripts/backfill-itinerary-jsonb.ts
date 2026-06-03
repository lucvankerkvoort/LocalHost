/**
 * Backfill Script: Populate Trip.itineraryData from normalized tables (LH-101)
 *
 * Purpose: For trips that have normalized TripAnchor/ItineraryDay/ItineraryItem rows
 * but a NULL itineraryData column, read the normalized structure and write it
 * as a JSONB blob.
 *
 * Safe to re-run: skips trips where itineraryData is already set.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-itinerary-jsonb.ts
 */

import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL,
  log: ['warn', 'error'],
}).$extends(withAccelerate());

async function main() {
  const trips = await prisma.trip.findMany({
    where: { itineraryData: { equals: Prisma.DbNull } },
    select: {
      id: true,
      title: true,
      preferences: true,
      stops: {
        orderBy: { order: 'asc' },
        select: {
          title: true,
          type: true,
          locations: true,
          order: true,
          days: {
            orderBy: { dayIndex: 'asc' },
            select: {
              dayIndex: true,
              date: true,
              title: true,
              suggestedHosts: true,
              items: {
                orderBy: { orderIndex: 'asc' },
                select: {
                  type: true,
                  title: true,
                  description: true,
                  startTime: true,
                  endTime: true,
                  locationName: true,
                  placeId: true,
                  lat: true,
                  lng: true,
                  experienceId: true,
                  hostId: true,
                  orderIndex: true,
                  createdByAI: true,
                },
              },
            },
          },
        },
      },
    },
  });

  console.log(`Found ${trips.length} trips with NULL itineraryData.`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const trip of trips) {
    if (trip.stops.length === 0) {
      console.log(`  SKIP  ${trip.id} — no normalized stops`);
      skipCount++;
      continue;
    }

    const payload = {
      title: trip.title,
      preferences: trip.preferences,
      stops: trip.stops.map((stop) => ({
        title: stop.title,
        type: stop.type,
        order: stop.order,
        locations: stop.locations,
        days: stop.days.map((day) => ({
          dayIndex: day.dayIndex,
          date: day.date ? day.date.toISOString() : null,
          title: day.title,
          suggestedHosts: day.suggestedHosts,
          items: day.items.map((item) => ({
            type: item.type,
            title: item.title,
            description: item.description,
            startTime: item.startTime ? item.startTime.toISOString() : null,
            endTime: item.endTime ? item.endTime.toISOString() : null,
            locationName: item.locationName,
            placeId: item.placeId ?? null,
            lat: item.lat,
            lng: item.lng,
            experienceId: item.experienceId,
            hostId: item.hostId,
            orderIndex: item.orderIndex,
            createdByAI: item.createdByAI,
          })),
        })),
      })),
    };

    try {
      await prisma.trip.update({
        where: { id: trip.id },
        data: { itineraryData: payload },
      });
      console.log(`  OK    ${trip.id} — ${trip.stops.length} stops`);
      successCount++;
    } catch (err) {
      console.error(`  ERROR ${trip.id}`, err);
      errorCount++;
    }
  }

  console.log(`\nDone. success=${successCount} skip=${skipCount} error=${errorCount}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
