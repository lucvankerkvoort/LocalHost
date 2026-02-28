import { prisma } from './src/lib/prisma';
async function test() {
  const cache = await prisma.placeCache.findMany({ where: { name: 'Springdale' } });
  console.log("CACHE FOR SPRINGDALE:", cache);
}
test().catch(console.error);
