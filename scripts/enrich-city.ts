import { ensureCityEnriched } from '../src/lib/activity-enrichment';

async function main() {
  const city = process.argv[2];
  const country = process.argv[3];
  
  if (!city || !country) {
    console.error('Usage: npx tsx scripts/enrich-city.ts "<City>" "<Country>"');
    console.error('Example: npx tsx scripts/enrich-city.ts "Paris" "France"');
    process.exit(1);
  }

  console.log(`\n🌍 Starting RAG Data Enrichment for ${city}, ${country}...`);
  console.log(`This will fetch places, generate OpenAI embeddings, and save them to your pgvector database.\n`);
  
  const result = await ensureCityEnriched(city, country, 1);
  
  console.log('\n✅ Enrichment pipeline finished!');
  console.log('Status:', result.status);
  console.log(`Database City Tracking:`, result.city);
}

main().catch((err) => {
  console.error('\n❌ Fatal error during enrichment:');
  console.error(err);
  process.exit(1);
});
