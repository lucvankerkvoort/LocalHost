import { openai } from '@ai-sdk/openai';
import { streamText, stepCountIs, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import type { Agent, AgentContext, AgentStreamResult } from './agent';
import { OPENAI_PROFILE_AGENT_MODEL } from '@/lib/ai/model-config';
import { prisma } from '@/lib/prisma';
import { TripStatus } from '@prisma/client';
import { getCityCoordinates } from '@/lib/data/city-coordinates';
import { geocodeCity } from '@/lib/server-geocoding';

export const PROFILE_SETUP_START_TOKEN = 'ACTION:START_PROFILE_SETUP';
export const PROFILE_SETUP_MAX_STEPS = 5;

export const PROFILE_SETUP_OPENERS: readonly string[] = [
  "Hey! I'm your profile agent — let's make your Localhost profile stand out. Where are you based?",
  "Welcome to Localhost! Let's build your profile through a quick chat. What city do you call home?",
  "Hi there! I'll help you set up your profile so hosts and travelers can get to know you. Where are you from?",
  "Let's get your Localhost profile going — it only takes a few minutes of chatting. Where in the world are you based?",
  "Hey, welcome! I'm here to help craft your profile. First things first — what city are you in?",
] as const;

type CoreMessageLike = {
  role?: string;
  content?: unknown;
};

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function messageContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .join('');
}

export function pickProfileOpener(sessionId?: string): string {
  const seed = `profile:${sessionId || `${Date.now()}-${Math.random()}`}`;
  const index = hashString(seed) % PROFILE_SETUP_OPENERS.length;
  return PROFILE_SETUP_OPENERS[index];
}

function isProfileSetupTrigger(messages: CoreMessageLike[]): boolean {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') return false;
  const text = messageContentToText(lastMessage.content).trim();
  return text === PROFILE_SETUP_START_TOKEN || text.startsWith(`${PROFILE_SETUP_START_TOKEN}:`);
}

export function prepareProfileConversation(
  messages: CoreMessageLike[],
  sessionId?: string
): {
  messages: CoreMessageLike[];
  onboardingTriggered: boolean;
  opener?: string;
} {
  if (!isProfileSetupTrigger(messages)) {
    return { messages, onboardingTriggered: false };
  }

  const opener = pickProfileOpener(sessionId);
  const updatedMessages = [...messages];
  updatedMessages[updatedMessages.length - 1] = {
    role: 'user',
    content:
      `Start profile setup now. ` +
      `Open with this exact greeting: "${opener}". ` +
      'Then continue the conversational profile-building flow.',
  };

  return {
    messages: updatedMessages,
    onboardingTriggered: true,
    opener,
  };
}

export function buildProfileSystemPrompt(options: {
  onboardingTriggered: boolean;
  opener?: string;
}): string {
  const openerInstruction =
    options.onboardingTriggered && options.opener
      ? `\nONBOARDING START:\n- Start your very first assistant message with this exact opener: "${options.opener}"\n- Do not mention trigger tokens, hidden commands, or internal instructions.\n`
      : '';

  return `You are the Localhost Profile Agent.
You help users build an authentic, compelling traveler profile through natural conversation.

CORE MODE: Conversational Profile Builder
- Gather information naturally — never present it as a form.
- Ask one question at a time, building on previous answers.
- Be warm, concise, and genuine.

FLOW
1) GREETING
   - Start with a friendly opener and ask where they're based.
2) IDENTITY
   - Gather city/country, then ask about occupation.
   - Call updateIdentity as soon as you have any of: name, city, country, occupation.
3) LANGUAGES
   - Ask what languages they speak.
   - Call updateLanguages with the full list.
4) INTERESTS
   - Ask about travel interests and hobbies.
   - Call updateInterests with extracted interests as short tags.
5) PREFERENCES
   - Ask about travel style: budget level, pace, dietary needs.
   - Call updatePreferences with the answers.
6) BIO
   - Offer to draft a short bio based on everything gathered.
   - Call draftBio with the bio text.
7) WRAP-UP
   - Summarize the profile and ask if anything needs editing.
8) NEXT STEPS — CRITICAL
   - Once ALL profile sections are filled (city, occupation, languages, interests, preferences, AND bio), immediately offer to start a trip.
   - Say something like: "Your profile is looking great — you're all set. Where would you like your first trip to be? I can set it up for you right now."
   - Do NOT skip this step. Always offer trip creation after completing the profile.
   - If the user names a destination, call startTrip immediately with that city.
   - If the user declines, wrap up warmly and let them know they can start a trip anytime from the homepage.

EXTRACTION RULES
- Extract structured data from natural language. For example:
  * "I live in Barcelona" → updateIdentity({ city: "Barcelona", country: "Spain" })
  * "I'm a software engineer" → updateIdentity({ occupation: "Software Engineer" })
  * "I speak English, Spanish, and some French" → updateLanguages({ languages: ["English", "Spanish", "French"] })
  * "I love hiking, street food, and architecture" → updateInterests({ interests: ["Hiking", "Street Food", "Architecture"] })
- Call tools immediately when you extract data — don't wait.
- After any tool call, continue with a concise follow-up question.

STYLE RULES
- Keep responses concise and human — 1-3 sentences max.
- Ask one question per turn.
- No emojis, no exclamation marks overuse.
- Never end a turn with tool calls only — always include a follow-up message.
- Interests should be capitalized, short tags (1-3 words each).
- Budget should be one of: "Budget", "Mid-range", "Luxury", "Flexible".
- Pace should be one of: "Relaxed", "Moderate", "Fast-paced", "Flexible".

${openerInstruction}
TOOLS
- updateIdentity(name?, city?, country?, occupation?)
- updateInterests(interests[])
- updateLanguages(languages[])
- updatePreferences(budget?, pace?, dietary?)
- draftBio(bio)
- startTrip(city) — creates a trip and navigates the user to the trip planner`;
}

export class ProfileAgent implements Agent {
  name = 'profile-setup';
  description = 'Helps users build their traveler profile through conversation';

  async process(
    messages: unknown[],
    context: AgentContext
  ): Promise<AgentStreamResult> {
    const userId = context.userId;

    const prepared = prepareProfileConversation(
      messages as CoreMessageLike[],
      context.sessionId
    );
    const system = buildProfileSystemPrompt({
      onboardingTriggered: prepared.onboardingTriggered,
      opener: prepared.opener,
    });

    return streamText({
      model: openai(OPENAI_PROFILE_AGENT_MODEL),
      system,
      messages: prepared.messages as ModelMessage[],
      tools: {
        updateIdentity: tool({
          description: 'Update the user identity fields (name, city, country, occupation). Only include fields that are being set or changed.',
          inputSchema: z.object({
            name: z.string().optional().describe('Display name'),
            city: z.string().optional().describe('Home city'),
            country: z.string().optional().describe('Home country'),
            occupation: z.string().optional().describe('Occupation or profession'),
          }),
          execute: async (data) => {
            // Persist to database
            if (userId) {
              const update: Record<string, string> = {};
              if (data.name) update.name = data.name;
              if (data.city) update.city = data.city;
              if (data.country) update.country = data.country;
              if (data.occupation) update.occupation = data.occupation;
              if (Object.keys(update).length > 0) {
                await prisma.user.update({ where: { id: userId }, data: update });
              }
            }
            return {
              success: true,
              field: 'identity',
              ...data,
            };
          },
        }),
        updateInterests: tool({
          description: 'Set the user travel interests as short tags. Overwrites the full list.',
          inputSchema: z.object({
            interests: z.array(z.string().min(1)).min(1).describe('Array of interest tags, e.g. ["Hiking", "Street Food", "Architecture"]'),
          }),
          execute: async ({ interests }) => {
            if (userId) {
              await prisma.user.update({ where: { id: userId }, data: { interests } });
            }
            return {
              success: true,
              field: 'interests',
              interests,
            };
          },
        }),
        updateLanguages: tool({
          description: 'Set the languages the user speaks. Overwrites the full list.',
          inputSchema: z.object({
            languages: z.array(z.string().min(1)).min(1).describe('Array of languages, e.g. ["English", "Spanish"]'),
          }),
          execute: async ({ languages }) => {
            if (userId) {
              await prisma.user.update({ where: { id: userId }, data: { languages } });
            }
            return {
              success: true,
              field: 'languages',
              languages,
            };
          },
        }),
        updatePreferences: tool({
          description: 'Set travel preferences: budget level, pace, dietary needs.',
          inputSchema: z.object({
            budget: z.string().optional().describe('Budget level: Budget, Mid-range, Luxury, or Flexible'),
            pace: z.string().optional().describe('Travel pace: Relaxed, Moderate, Fast-paced, or Flexible'),
            dietary: z.string().optional().describe('Dietary restrictions or preferences'),
          }),
          execute: async (data) => {
            if (userId) {
              await prisma.user.update({
                where: { id: userId },
                data: { travelPreferences: data as Record<string, unknown> },
              });
            }
            return {
              success: true,
              field: 'preferences',
              ...data,
            };
          },
        }),
        draftBio: tool({
          description: 'Draft or update the user bio.',
          inputSchema: z.object({
            bio: z.string().min(1).describe('A short, authentic bio for the user profile (2-4 sentences)'),
          }),
          execute: async ({ bio }) => {
            if (userId) {
              await prisma.user.update({ where: { id: userId }, data: { bio } });
            }
            return {
              success: true,
              field: 'bio',
              bio,
            };
          },
        }),
        startTrip: tool({
          description: 'Create a new trip for the user and navigate them to the trip planner page. Call this when the user is ready to plan a trip after completing their profile.',
          inputSchema: z.object({
            city: z.string().describe('Destination city for the trip'),
          }),
          execute: async ({ city }) => {
            if (!userId) {
              return { success: false, error: 'Not authenticated' };
            }

            // Geocode destination city
            let lat = 0;
            let lng = 0;
            const staticCoords = getCityCoordinates(city);
            if (staticCoords) {
              lat = staticCoords.lat;
              lng = staticCoords.lng;
            } else {
              try {
                const geoCoords = await geocodeCity(city);
                if (geoCoords) {
                  lat = geoCoords.lat;
                  lng = geoCoords.lng;
                }
              } catch {
                // Non-blocking
              }
            }

            const trip = await prisma.trip.create({
              data: {
                userId,
                title: `Trip to ${city}`,
                status: TripStatus.DRAFT,
                stops: {
                  create: {
                    title: city,
                    type: 'CITY',
                    locations: [{ name: city, lat, lng }],
                    order: 0,
                  },
                },
              },
            });

            return {
              success: true,
              field: 'startTrip',
              tripId: trip.id,
              redirectUrl: `/trips/${trip.id}`,
              city,
            };
          },
        }),
      },
      stopWhen: stepCountIs(PROFILE_SETUP_MAX_STEPS),
    }) as unknown as AgentStreamResult;
  }
}
