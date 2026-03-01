import { prisma } from './src/lib/prisma';
import { resolvePlaceTool } from './src/lib/ai/tools/resolve-place';

async function test() {
  const context = "Springdale, UT, United States";
  
  // Delete the specific bad cache entries
  await prisma.placeCache.deleteMany({
    where: { name: 'springdale' }
  });
  console.log("Deleted cached entries for springdale");

  console.log(`\n--- Testing Context: ${context} ---`);
  const res = await (resolvePlaceTool as any).handler({ name: 'Springdale', context });
  console.log(JSON.stringify(res, null, 2));
}

test().catch(console.error).finally(() => process.exit(0));
