import { openai } from '@ai-sdk/openai';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { Agent, AgentContext } from './agent';

// ... imports

const SYSTEM_PROMPT = `You are a creative assistant helping a local host create an authentic experience on Localhost.
Your goal is to interview the user and incrementally build a "Day in the Life" experience.

PROCESS:
1. Ask the user which city they are in (if not known).
2. Ask for a title or theme for their experience.
3. Ask them to add stops (places) they love.
4. Help them refine the description. Generate both a "Short Description" (hook) and a "Full Description" (narrative).

TOOLS:
- ALWAYS use \`updateCity\` when the user tells you their city.
- ALWAYS use \`addStop\` when the user mentions a specific place they want to include.
- Use \`updateDetails\` to set title, duration, short description, or full description.
- Use \`completeProfile\` when you have gathered all necessary information (city, at least one stop, title, descriptions) and the user confirms they are done.

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
        // ... other tools
        updateCity: tool({
          description: 'Set the city for the experience',
          inputSchema: z.object({
            name: z.string(),
            lat: z.number(),
            lng: z.number(),
          }),
          execute: async ({ name, lat, lng }) => {
            return { success: true, name, lat, lng };
          },
        }),
        addStop: tool({
          description: 'Add a stop to the experience',
          inputSchema: z.object({
            name: z.string(),
            lat: z.number(),
            lng: z.number(),
            description: z.string().optional(),
          }),
          execute: async ({ name, lat, lng, description }) => {
            return { success: true, name, lat, lng, description };
          },
        }),
        updateDetails: tool({
          description: 'Update experience details (title, descriptions, duration)',
          inputSchema: z.object({
            title: z.string().optional(),
            shortDesc: z.string().optional().describe('A brief, catchy hook (1-2 sentences)'),
            longDesc: z.string().optional().describe('A full, immersive narrative of the experience (paragraph)'),
            duration: z.number().optional().describe('Duration in minutes'),
          }),
          execute: async ({ title, shortDesc, longDesc, duration }) => {
            // Return the data - client will ingest via tool events
            return { success: true, title, shortDesc, longDesc, duration };
          },
        }),
        // ... other tools
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
        completeProfile: tool({
            description: 'Signal that the host profile creation is complete.',
            inputSchema: z.object({}),
            execute: async () => {
                return { success: true };
            }
        }),
      },
    });
  }
}
