import { openai } from '@ai-sdk/openai';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { Agent, AgentContext } from './agent';

const SYSTEM_PROMPT = `You are a creative assistant helping a local host create an authentic experience on Localhost.
Your goal is to interview the user and incrementally build a "Day in the Life" experience.

PROCESS:
1. Ask the user which city they are in (if not known).
2. Ask for a title or theme for their experience.
3. Ask them to add stops (places) they love.
4. Help them refine the description.

TOOLS:
- ALWAYS use \`updateCity\` when the user tells you their city.
- ALWAYS use \`addStop\` when the user mentions a specific place they want to include.
- Use \`updateDetails\` to set title, duration, or description.

Be encouraging and ask one question at a time.
Use the \`flyToLocation\` tool to show the user the map location when discussing stops.
`;

export class HostCreationAgent implements Agent {
  name = 'host-creation';
  description = 'Assists users in creating a new hosted experience';

  async process(messages: any[], context: AgentContext) {
    return streamText({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      messages,
      tools: {
        updateCity: tool({
          description: 'Set the city for the experience',
          inputSchema: z.object({
            name: z.string(),
            lat: z.number(),
            lng: z.number(),
          }),
        }),
        addStop: tool({
          description: 'Add a stop to the experience',
          inputSchema: z.object({
            name: z.string(),
            lat: z.number(),
            lng: z.number(),
            description: z.string().optional(),
          }),
        }),
        updateDetails: tool({
          description: 'Update experience details (title, desciption, duration)',
          inputSchema: z.object({
            title: z.string().optional(),
            shortDesc: z.string().optional(),
            duration: z.number().optional().describe('Duration in minutes'),
          }),
        }),
        flyToLocation: tool({
            description: 'Fly the interactive globe to a specific location defined by latitude and longitude.',
            inputSchema: z.object({
              lat: z.number(),
              lng: z.number(),
              label: z.string().optional(),
              height: z.number().optional().default(50000),
            }),
            execute: async ({ lat, lng, label, height }) => {
                // Just return success, client handles animation
                return { success: true, lat, lng, label, height };
            }
        }),
      },
    });
  }
}
