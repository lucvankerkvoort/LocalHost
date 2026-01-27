import { z } from 'zod';
import { createTool, ToolResult } from './tool-registry';
import { semanticSearchHosts, semanticSearchExperiences, type SearchIntent } from '@/lib/semantic-search';

// ============================================================================
// Schema
// ============================================================================

const SearchLocalhostsParams = z.object({
  query: z.string().describe('Natural language search query'),
  location: z.string().optional().describe('City or area to search in'),
  category: z.enum(['food', 'art', 'culture', 'nature', 'adventure', 'nightlife', 'wellness', 'family'])
    .optional()
    .describe('Filter by experience category'),
  searchType: z.enum(['hosts', 'experiences']).default('experiences').describe('Search for hosts or specific experiences'),
  limit: z.number().min(1).max(50).default(10).describe('Maximum results to return'),
});

type SearchLocalhostsResult = {
  results: Array<{
    id: string;
    type: 'host' | 'experience';
    name: string;
    description: string;
    photo: string;
    score: number;
    matchReasons: string[];
    // Host-specific
    interests?: string[];
    // Experience-specific
    hostName?: string;
    hostId?: string;
    price?: number;
    duration?: number;
    category?: string;
  }>;
  query: string;
  totalFound: number;
};

// ============================================================================
// Tool Implementation
// ============================================================================

export const searchLocalhostsTool = createTool({
  name: 'search_localhosts',
  description: 'Search for local hosts and experiences matching user intent. Use this to find authentic local experiences, food tours, cultural activities, and more.',
  parameters: SearchLocalhostsParams,

  async handler(params): Promise<ToolResult<SearchLocalhostsResult>> {
    try {
      // Convert params to SearchIntent format
      const intent: SearchIntent = {
        categories: params.category ? [params.category] : [],
        keywords: params.query.split(/\s+/).filter(w => w.length > 2),
        location: params.location,
        preferences: [],
        activities: [],
      };

      if (params.searchType === 'hosts') {
        const results = semanticSearchHosts(intent, params.limit);
        
        return {
          success: true,
          data: {
            results: results.map(r => ({
              id: r.host.id,
              type: 'host' as const,
              name: r.host.name,
              description: r.host.quote,
              photo: r.host.photo,
              score: r.score,
              matchReasons: r.matchReasons,
              interests: r.host.interests,
            })),
            query: params.query,
            totalFound: results.length,
          },
        };
      } else {
        const results = semanticSearchExperiences(intent, params.limit);
        
        return {
          success: true,
          data: {
            results: results.map(r => ({
              id: r.experience.id,
              type: 'experience' as const,
              name: r.experience.title,
              description: r.experience.description,
              photo: r.experience.photo,
              score: r.score,
              matchReasons: r.matchReasons,
              hostName: r.experience.hostName,
              hostId: r.experience.hostId,
              price: r.experience.price,
              duration: r.experience.duration,
              category: r.experience.category,
            })),
            query: params.query,
            totalFound: results.length,
          },
        };

      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
        code: 'SEARCH_ERROR',
      };
    }
  },
});
