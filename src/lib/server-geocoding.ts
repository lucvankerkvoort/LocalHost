import { resolvePlaceTool } from '@/lib/ai/tools/resolve-place';

export async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  const trimmedCity = city.trim();
  if (!trimmedCity) return null;

  const result = await resolvePlaceTool.handler({
    name: trimmedCity,
  });

  if (result.success) {
    return result.data.location;
  }

  console.warn(`[geocodeCity] resolve_place failed for "${city}"`, result.error);
  return null;
}
