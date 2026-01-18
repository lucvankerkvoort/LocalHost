import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, tool, stepCountIs, generateObject } from 'ai';
import { z } from 'zod';
import { HOSTS, type Host } from '@/lib/data/hosts';
import { 
  semanticSearchHosts, 
  semanticSearchExperiences, 
  type SearchIntent 
} from '@/lib/semantic-search';

// Schema for intent extraction
const searchIntentSchema = z.object({
  categories: z.array(z.string()).describe('Relevant experience categories like food-drink, arts-culture, outdoor-adventure, nightlife-social, wellness, learning, family'),
  keywords: z.array(z.string()).describe('Key terms and concepts the user is interested in'),
  location: z.string().optional().describe('City or country mentioned'),
  preferences: z.array(z.string()).describe('User preferences like solo travel, budget, time of day, etc'),
  activities: z.array(z.string()).describe('Specific activities mentioned like cooking, hiking, tours, etc'),
});

// System prompt that handles semantic search and itinerary planning
const SYSTEM_PROMPT = `You are a friendly matchmaker for Localhost, a platform that connects travelers with locals and authentic experiences.

Your role depends on the MODE indicated in the user's message:

**LOCALS MODE** (when message contains "[Mode: locals]"):
- Help travelers find local hosts who match their vibe
- Use semanticSearch with searchType "hosts" to find the best matches
- The search uses AI to understand what they're looking for semantically
- For example: "tourist spots" matches hosts interested in history, landmarks, architecture

**EXPERIENCES MODE** (when message contains "[Mode: experiences]"):
- Help travelers find activities and experiences
- Use semanticSearch with searchType "experiences" to find the best matches
- The search understands concepts like "touristy things" → history/landmarks/culture

**ITINERARY MODE** (default when no mode specified, or on /itinerary page):
- Help travelers plan full trip itineraries
- When they describe a trip, generate a structured itinerary with destinations
- ALWAYS include a JSON block with destination data for the globe visualization
- Format destinations with exact coordinates (lat/lng)

Example response format for itinerary:
"Here's your 5-day Japan itinerary:

**Day 1-2: Tokyo** - Explore Shibuya, Senso-ji Temple, and try street food
**Day 3-4: Kyoto** - Visit Fushimi Inari and the bamboo grove
**Day 5: Osaka** - Dotonbori food tour and castle visit

\`\`\`json
{
  "destinations": [
    {"name": "Tokyo", "lat": 35.6762, "lng": 139.6503, "day": 1, "activities": ["Shibuya", "Senso-ji Temple", "Street food"]},
    {"name": "Kyoto", "lat": 35.0116, "lng": 135.7681, "day": 3, "activities": ["Fushimi Inari", "Bamboo Grove"]},
    {"name": "Osaka", "lat": 34.6937, "lng": 135.5023, "day": 5, "activities": ["Dotonbori", "Osaka Castle"]}
  ]
}
\`\`\`"

Guidelines:
- Extract the essence of what they want - don't just use their exact words
- Think about related concepts (tourist spots = history, landmarks, famous places)
- After getting results, summarize the top 3-5 matches in a friendly way
- Keep responses warm and helpful
- For itineraries, ALWAYS include the JSON code block with lat/lng coordinates`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Convert UIMessage[] from client to ModelMessage[] for streamText
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: {
      semanticSearch: tool({
        description: 'Search for hosts or experiences using semantic understanding. Extracts intent from the query and finds matches based on meaning, not just keywords. For example, "tourist spots" will match history, landmarks, and cultural experiences.',
        inputSchema: z.object({
          searchType: z.enum(['hosts', 'experiences']).describe('Whether to search for hosts/locals or experiences/activities'),
          userQuery: z.string().describe('The raw user query to understand'),
          extractedIntent: z.object({
            categories: z.array(z.string()).describe('Inferred categories: food-drink, arts-culture, outdoor-adventure, nightlife-social, wellness, learning, family'),
            keywords: z.array(z.string()).describe('Key concepts and related terms (expand tourist spots to include history, landmarks, famous, sightseeing, etc)'),
            location: z.string().optional().describe('City or country if mentioned'),
            preferences: z.array(z.string()).describe('Travel preferences mentioned'),
            activities: z.array(z.string()).describe('Specific activities'),
          }).describe('The semantic understanding of what the user wants - think about related concepts'),
          limit: z.number().optional().describe('Max results to return, default 20'),
        }),
        execute: async ({ searchType, userQuery, extractedIntent, limit = 20 }) => {
          const intent: SearchIntent = {
            categories: extractedIntent.categories,
            keywords: extractedIntent.keywords,
            location: extractedIntent.location,
            preferences: extractedIntent.preferences,
            activities: extractedIntent.activities,
          };

          if (searchType === 'hosts') {
            const results = semanticSearchHosts(intent, limit);
            return {
              success: true,
              searchType: 'hosts',
              resultCount: results.length,
              query: userQuery,
              intentUnderstood: extractedIntent,
              results: results.map(r => ({
                id: r.host.id,
                name: r.host.name,
                city: r.host.city,
                country: r.host.country,
                photo: r.host.photo,
                quote: r.host.quote,
                interests: r.host.interests,
                score: r.score,
                matchReasons: r.matchReasons,
                experienceCount: r.host.experiences.length,
                topExperience: r.host.experiences[0]?.title,
              })),
            };
          } else {
            const results = semanticSearchExperiences(intent, limit);
            return {
              success: true,
              searchType: 'experiences',
              resultCount: results.length,
              query: userQuery,
              intentUnderstood: extractedIntent,
              results: results.map(r => ({
                id: r.experience.id,
                title: r.experience.title,
                description: r.experience.description,
                category: r.experience.category,
                hostName: r.experience.hostName,
                city: r.experience.city,
                country: r.experience.country,
                price: r.experience.price,
                rating: r.experience.rating,
                reviewCount: r.experience.reviewCount,
                score: r.score,
                matchReasons: r.matchReasons,
              })),
            };
          }
        },
      }),
      
      navigate: tool({
        description: 'Navigate the user to a specific page with search results. Use after showing semantic search results.',
        inputSchema: z.object({
          page: z.enum(['home', 'hosts', 'host-profile', 'explore']).describe('The page to navigate to'),
          hostId: z.string().optional().describe('Host ID, required when page is "host-profile"'),
          city: z.string().optional().describe('City filter for hosts page'),
          interests: z.string().optional().describe('Comma-separated interests for hosts page'),
          query: z.string().optional().describe('Search query for explore page'),
          category: z.string().optional().describe('Category filter for explore page'),
        }),
        execute: async ({ page, hostId, city, interests, query, category }) => {
          let url = '/';
          const params = new URLSearchParams();
          
          switch (page) {
            case 'home':
              url = '/';
              break;
            case 'hosts':
              url = '/hosts';
              if (city) params.set('city', city);
              if (interests) params.set('interests', interests);
              break;
            case 'host-profile':
              if (hostId) {
                url = `/hosts/${hostId}`;
              } else {
                return { success: false, error: 'Host ID required' };
              }
              break;
            case 'explore':
              url = '/explore';
              if (query) params.set('query', query);
              if (category) params.set('category', category);
              break;
          }
          
          // Append query params if any
          const queryString = params.toString();
          if (queryString) {
            url += `?${queryString}`;
          }
          
          return {
            success: true,
            action: 'navigate',
            url,
            message: `Navigating to ${page}${queryString ? ` with filters: ${queryString}` : ''}`,
          };
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
