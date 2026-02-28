import { prisma } from './src/lib/prisma';

async function clearCache() {
  const result = await prisma.placeCache.deleteMany({});
  console.log(`Cleared ${result.count} cached geocoded places!`);
}

clearCache().catch(console.error).finally(() => process.exit(0));
