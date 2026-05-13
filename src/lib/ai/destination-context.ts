import rawDestinations from '@/data/destinations.json';

export type DestinationContext = {
  city: string;
  country: string;
  summary: string;
  highlights: string[];
  neighborhoods: string[];
  practical: string[];
};

type RawDestination = DestinationContext & { aliases: string[] };

const destinations = rawDestinations as RawDestination[];

/**
 * Looks up a curated destination context by city and country.
 * Matching is case-insensitive and checks aliases.
 * Returns null when no entry exists — callers should degrade gracefully.
 */
export function getDestinationContext(city: string, country: string): DestinationContext | null {
  const cityNorm = city.trim().toLowerCase();
  const countryNorm = country.trim().toLowerCase();

  const match = destinations.find((d) => {
    const sameCountry =
      d.country.toLowerCase() === countryNorm ||
      // Allow loose country matching for small city-states and common abbreviations
      countryNorm.includes(d.country.toLowerCase()) ||
      d.country.toLowerCase().includes(countryNorm);

    if (!sameCountry) return false;

    return (
      d.city.toLowerCase() === cityNorm ||
      d.aliases.some((a) => a === cityNorm)
    );
  });

  if (!match) return null;

  return {
    city: match.city,
    country: match.country,
    summary: match.summary,
    highlights: match.highlights,
    neighborhoods: match.neighborhoods,
    practical: match.practical,
  };
}

/**
 * Formats a DestinationContext as a compact text block for injection
 * into the LLM system prompt.
 */
export function formatDestinationContextBlock(ctx: DestinationContext): string {
  return `DESTINATION CONTEXT — ${ctx.city}, ${ctx.country}:
${ctx.summary}

Key highlights: ${ctx.highlights.join(', ')}

Notable neighborhoods: ${ctx.neighborhoods.join(', ')}

Practical tips: ${ctx.practical.join(' ')}`;
}
