import { NextRequest, NextResponse } from 'next/server';
import { loadAllHosts } from '@/lib/data/hosts';

/**
 * GET /api/hosts
 * Returns all published hosts (static + database-backed).
 * Optional query param: ?city=Barcelona (case-insensitive filter)
 */
export async function GET(request: NextRequest) {
  try {
    const city = request.nextUrl.searchParams.get('city');
    let hosts = await loadAllHosts();

    if (city) {
      const cityLower = city.toLowerCase();
      hosts = hosts.filter(
        (h) =>
          h.city.toLowerCase().includes(cityLower) ||
          cityLower.includes(h.city.toLowerCase())
      );
    }

    return NextResponse.json({ hosts });
  } catch (error) {
    console.error('[api/hosts] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load hosts' },
      { status: 500 }
    );
  }
}
