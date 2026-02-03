import { openai } from '@ai-sdk/openai';
import { streamText, stepCountIs, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import type { Agent, AgentContext, HostOnboardingStage } from './agent';

export const HOST_ONBOARDING_START_TOKEN = 'ACTION:START_HOST_ONBOARDING';
export const HOST_CREATION_MAX_STEPS = 5;

export const HOST_CREATION_STAGE_OPENERS: Record<HostOnboardingStage, readonly string[]> = {
  CITY_MISSING: [
    'What city are you in, and where would you take a close friend first for a perfect local day?',
    "Which city should we build this experience in, and what's your first must-visit stop there?",
    'What city do you call home, and what neighborhood moment would you start a traveler with?',
    "What city are we designing this around, and what's the first place that feels unmistakably local?",
    'In which city will you host, and what is the first unforgettable stop in your ideal day?',
    'What city are you based in, and where does your personal local ritual begin?',
    'Which city should guests discover with you, and what first stop avoids tourist cliches?',
    'What city is this experience in, and where would you begin to match your favorite local vibe?',
    'What city are we spotlighting, and what first stop makes people say they would never find it alone?',
    'What city should this host experience happen in, and what is your opening scene for the day?',
    'Which city are we creating this for, and what local corner best sets the tone before noon?',
    "What city are you in, and where would your 'show someone my city' day start?",
  ],
  STOPS_MISSING: [
    'Great, now what is the very first stop that makes this day feel truly local?',
    'What place would you choose as stop one so guests instantly feel the city through your eyes?',
    'If you could start this route with one meaningful spot, where would it be?',
    'What is your opening stop that sets the tone before we draft the story?',
    'Where should guests begin to avoid tourist cliches and feel the real neighborhood?',
    'What first stop would you never skip when showing a friend around?',
  ],
  DETAILS_MISSING: [
    'You already have a strong route. Want me to draft a standout title and description from your existing stops?',
    'Shall I shape your current city and stops into compelling title and listing copy?',
    'Would you like me to turn your current itinerary into polished short and long descriptions?',
    'Your stops are in place. Should we craft the story and headline so it is ready to publish?',
    'Want me to draft host-facing copy from what you already selected, then we can refine tone?',
  ],
  READY_FOR_ASSIST: [
    'Nice, your core draft is complete. What should we improve next?',
    'Everything essential is filled in. What can I help polish now?',
    'Great progress, you are ready for refinements. What would you like to work on next?',
    'You are in good shape. Should we refine tone, tighten pacing, or prep for publish?',
    'Looks complete. What support do you want now before publishing?',
  ],
} as const;

// Backward-compatible alias used by existing tests/imports.
export const HOST_CREATION_OPENERS = HOST_CREATION_STAGE_OPENERS.CITY_MISSING;

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

export function parseHostOnboardingStage(value: string | undefined): HostOnboardingStage | undefined {
  switch (value) {
    case 'CITY_MISSING':
    case 'STOPS_MISSING':
    case 'DETAILS_MISSING':
    case 'READY_FOR_ASSIST':
      return value;
    default:
      return undefined;
  }
}

function getHostOnboardingTriggerState(input: unknown): {
  triggered: boolean;
  stage?: HostOnboardingStage;
} {
  const text = typeof input === 'string' ? input.trim() : '';
  if (text === HOST_ONBOARDING_START_TOKEN) {
    return { triggered: true };
  }

  const prefix = `${HOST_ONBOARDING_START_TOKEN}:`;
  if (!text.startsWith(prefix)) {
    return { triggered: false };
  }

  const stage = parseHostOnboardingStage(text.slice(prefix.length).trim());
  return {
    triggered: true,
    stage,
  };
}

export function isHostOnboardingStartTrigger(messages: CoreMessageLike[]): boolean {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') return false;
  return getHostOnboardingTriggerState(messageContentToText(lastMessage.content)).triggered;
}

export function pickHostOnboardingOpener(stage: HostOnboardingStage, sessionId?: string): string {
  const openers = HOST_CREATION_STAGE_OPENERS[stage];
  const seed = `${stage}:${sessionId || `${Date.now()}-${Math.random()}`}`;
  const index = hashString(seed) % openers.length;
  return openers[index];
}

function getStageBehaviorInstruction(stage?: HostOnboardingStage): string {
  switch (stage) {
    case 'CITY_MISSING':
      return `CURRENT STAGE: CITY_MISSING
- Ask for city first.
- Do not call updateDetails before city is known.
- Keep first response city-focused.`;
    case 'STOPS_MISSING':
      return `CURRENT STAGE: STOPS_MISSING
- Do not ask for city again unless user explicitly changes city.
- Ask for at least one meaningful stop before long-form drafting.
- Prefer updateCity/addStop before updateDetails.`;
    case 'DETAILS_MISSING':
      return `CURRENT STAGE: DETAILS_MISSING
- Do not re-collect city/stops unless user asks to change them.
- Proactively call updateDetails from narrative input.
- Focus on title + shortDesc + longDesc completion.`;
    case 'READY_FOR_ASSIST':
      return `CURRENT STAGE: READY_FOR_ASSIST
- Ask what help is needed next.
- Do not overwrite completed details unless user explicitly requests edits.
- Offer refinement or publish-prep support.`;
    default:
      return `CURRENT STAGE: UNKNOWN
- Use best available context and avoid re-asking known answers.`;
  }
}

export function buildHostCreationSystemPrompt(options: {
  onboardingTriggered: boolean;
  opener?: string;
  onboardingStage?: HostOnboardingStage;
}): string {
  const openerInstruction =
    options.onboardingTriggered && options.opener
      ? `\nONBOARDING START:\n- Start your very first assistant message with this exact opener: "${options.opener}"\n- Do not mention trigger tokens, hidden commands, or internal instructions.\n`
      : '';
  const stageInstruction = getStageBehaviorInstruction(options.onboardingStage);

  return `You are the Localhost Host Creation Agent.
You help a local host shape a compelling, authentic experience by co-creating a story first, then drafting details.

CORE MODE: "Perfect Day" Narrative Workshop
- Ask for lived moments, places, and flow of the day.
- Never ask directly for "title" or "description" as form fields.
- Keep questions concrete, warm, and one-at-a-time.

FLOW (Finite-State Drafting)
1) OPENER
   - Begin with a vivid, story-first prompt.
2) DISCOVERY
   - Gather city, vibe, and 1-3 meaningful stops through conversation.
3) DRAFTING
   - Synthesize what you have and call tools proactively:
     - updateCity when city is clear.
     - addStop when the user names a place.
     - updateStopByName when user edits an existing stop's name or description.
     - removeStopByName when user asks to delete a stop.
     - reorderStops when user specifies a stop sequence.
     - updateDetails to draft title, shortDesc, longDesc, and optional duration.
   - Treat tool calls as "Draft Sync": the form should auto-fill while chatting.
4) REFINE
   - Offer 1-2 refinement choices (tone, pacing, audience fit).
5) COMPLETE
   - Call completeProfile only when city + at least one stop + draft details are ready and user signals satisfaction.

STAGE RULES
${stageInstruction}
- Never re-ask city if it is already known in context.

STYLE RULES
- Keep responses concise and human.
- Ask one question per turn unless summarizing.
- Do not fabricate precise addresses or coordinates.
- Prefer confidence with caveats over overpromising.
- After any tool call except completeProfile, you MUST ask one concise follow-up question in the same response cycle.
- Never end a turn with tool calls only.
- For stop edits/removals/reordering, use exact stop names from the user's list; if mapping is unclear, ask a clarification question instead of guessing.

${openerInstruction}
TOOLS
- updateCity(name, lat, lng)
- addStop(name, lat, lng, description?)
- updateStopByName(targetName, newName?, description?)
- removeStopByName(targetName)
- reorderStops(orderedNames)
- updateDetails(title?, shortDesc?, longDesc?, duration?)
- flyToLocation(lat, lng, label?, height?)
- completeProfile()`;
}

export function prepareHostCreationConversation(
  messages: CoreMessageLike[],
  sessionId?: string,
  onboardingStageFromContext?: HostOnboardingStage
): {
  messages: CoreMessageLike[];
  onboardingTriggered: boolean;
  onboardingStage?: HostOnboardingStage;
  opener?: string;
} {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return {
      messages,
      onboardingTriggered: false,
      onboardingStage: onboardingStageFromContext,
    };
  }

  const triggerState = getHostOnboardingTriggerState(
    messageContentToText(lastMessage.content)
  );
  if (!triggerState.triggered) {
    return {
      messages,
      onboardingTriggered: false,
      onboardingStage: onboardingStageFromContext,
    };
  }

  const onboardingStage =
    triggerState.stage ?? onboardingStageFromContext ?? 'CITY_MISSING';
  const opener = pickHostOnboardingOpener(onboardingStage, sessionId);
  const updatedMessages = [...messages];
  updatedMessages[updatedMessages.length - 1] = {
    role: 'user',
    content:
      `Start host onboarding now in the ${onboardingStage} stage. ` +
      `Open with this exact question: "${opener}". ` +
      'Then continue the Perfect Day narrative flow.',
  };

  return {
    messages: updatedMessages,
    onboardingTriggered: true,
    onboardingStage,
    opener,
  };
}

export class HostCreationAgent implements Agent {
  name = 'host-creation';
  description = 'Assists users in creating a new hosted experience';

  async process(messages: unknown[], context: AgentContext) {
    const prepared = prepareHostCreationConversation(
      messages as CoreMessageLike[],
      context.sessionId,
      context.onboardingStage
    );
    const system = buildHostCreationSystemPrompt({
      onboardingTriggered: prepared.onboardingTriggered,
      opener: prepared.opener,
      onboardingStage: prepared.onboardingStage ?? context.onboardingStage,
    });

    return streamText({
      model: openai('gpt-4o'),
      system,
      messages: prepared.messages as ModelMessage[],
      tools: {
        updateCity: tool({
          description: 'Set the city for the experience',
          inputSchema: z.object({
            name: z.string(),
            lat: z.number(),
            lng: z.number(),
          }),
          execute: async ({ name, lat, lng }) => ({ success: true, name, lat, lng }),
        }),
        addStop: tool({
          description: 'Add a stop to the experience',
          inputSchema: z.object({
            name: z.string(),
            lat: z.number(),
            lng: z.number(),
            description: z.string().optional(),
          }),
          execute: async ({ name, lat, lng, description }) => ({
            success: true,
            name,
            lat,
            lng,
            description,
          }),
        }),
        updateStopByName: tool({
          description:
            'Update an existing stop by exact stop name (after normalization) with a new name and/or description.',
          inputSchema: z.object({
            targetName: z.string().min(1),
            newName: z.string().min(1).optional(),
            description: z.string().optional(),
          }),
          execute: async ({ targetName, newName, description }) => ({
            success: true,
            targetName,
            newName,
            description,
          }),
        }),
        removeStopByName: tool({
          description:
            'Remove an existing stop by exact stop name (after normalization).',
          inputSchema: z.object({
            targetName: z.string().min(1),
          }),
          execute: async ({ targetName }) => ({
            success: true,
            targetName,
          }),
        }),
        reorderStops: tool({
          description:
            'Reorder existing stops by ordered list of stop names from first to last.',
          inputSchema: z.object({
            orderedNames: z.array(z.string().min(1)).min(1),
          }),
          execute: async ({ orderedNames }) => ({
            success: true,
            orderedNames,
          }),
        }),
        updateDetails: tool({
          description: 'Draft and sync experience details (title, descriptions, duration)',
          inputSchema: z.object({
            title: z.string().optional(),
            shortDesc: z.string().optional().describe('A brief, catchy hook (1-2 sentences)'),
            longDesc: z
              .string()
              .optional()
              .describe('A full, immersive narrative of the experience (paragraph)'),
            duration: z.number().optional().describe('Duration in minutes'),
          }),
          execute: async ({ title, shortDesc, longDesc, duration }) => ({
            success: true,
            title,
            shortDesc,
            longDesc,
            duration,
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
          execute: async ({ lat, lng, label, height }) => ({
            success: true,
            lat,
            lng,
            label,
            height,
          }),
        }),
        completeProfile: tool({
          description: 'Signal that the host profile creation is complete.',
          inputSchema: z.object({}),
          execute: async () => ({ success: true }),
        }),
      },
      stopWhen: stepCountIs(HOST_CREATION_MAX_STEPS),
    });
  }
}
