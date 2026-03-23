import { convertToModelMessages } from 'ai';
import { auth } from '@/auth';
import { agentRouter } from '@/lib/conversation/router';
import { conversationController } from '@/lib/conversation/controller';
import { validateAgentOutput, withExecution } from '@/lib/agent-constraints';
import type { HostOnboardingStage } from '@/lib/agents/agent';
import { rateLimit } from '@/lib/api/rate-limit';
import { z } from 'zod';

const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.string(),
    // AI SDK v6 uses `parts` instead of `content` — make content optional
    content: z.union([z.string(), z.array(z.unknown())]).optional(),
  }).passthrough()).min(1),
  id: z.string().optional(),
  // Trip IDs are CUIDs, not UUIDs
  tripId: z.string().min(1).optional(),
  intent: z.string().optional(),
  onboardingStage: z.string().optional(),
  execution: z.object({
    activeAgent: z.string(),
    enabledSkills: z.array(z.string()),
    expectedOutput: z.string().optional(),
  }).optional(),
});

export const maxDuration = 300; // Allow 5 minutes for generation

// Rate limit: 20 requests per minute per IP
const chatLimiter = rateLimit({ interval: 60_000, limit: 20 });

const HOST_ONBOARDING_STAGES: HostOnboardingStage[] = [
  'CITY_MISSING',
  'STOPS_MISSING',
  'DETAILS_MISSING',
  'READY_FOR_ASSIST',
];

function parseOnboardingStage(value: unknown): HostOnboardingStage | undefined {
  if (typeof value !== 'string') return undefined;
  if (HOST_ONBOARDING_STAGES.includes(value as HostOnboardingStage)) {
    return value as HostOnboardingStage;
  }
  return undefined;
}

export async function POST(req: Request) {
  // Rate limit check
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const { success: withinLimit, resetAt } = await chatLimiter.check(ip);
  if (!withinLimit) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
      },
    });
  }

  const session = await auth();
  const body = await req.json();
  const parsedBody = ChatRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return new Response(JSON.stringify({ error: 'Invalid input', issues: parsedBody.error.issues }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { messages, id, tripId } = parsedBody.data;

  // Convert UIMessage[] from client to CoreMessage[] for streamText
  const modelMessages = await convertToModelMessages(messages);

  // Check if intent was explicitly provided in the request body
  const requestedIntent = parsedBody.data.intent;

  // Determine intent (routing)
  // If explicitly provided (e.g., from become-host page), use that. Otherwise, let router decide.
  const intent = requestedIntent || await agentRouter.route(modelMessages);

  // Get the appropriate agent
  const agent = agentRouter.getAgent(intent);

  // Delegate processing to the agent
  const execution = parsedBody.data.execution;
  const strictConstraints = process.env.AGENT_CONSTRAINTS_STRICT === 'true';

  if (strictConstraints && !execution) {
    return new Response(JSON.stringify({ error: 'Execution contract required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (execution && execution.activeAgent !== agent.name) {
    return new Response(JSON.stringify({ error: 'Active agent mismatch', expected: agent.name, provided: execution.activeAgent }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const onboardingStage = parseOnboardingStage(parsedBody.data.onboardingStage);
  const runAgent = () =>
    agent.process(modelMessages, {
      userId: session?.user?.id,
      sessionId: id,
      onboardingStage,
      tripId,
    });
  const result = execution ? await withExecution(execution, runAgent) : await runAgent();

  if (execution || strictConstraints) {
    const output = await result.text;
    const validation = validateAgentOutput(execution?.activeAgent || agent.name, output);
    if (!validation.ok) {
      return new Response(JSON.stringify({ error: 'Output contract violation', details: validation.failure }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(output, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Return the stream response
  return result.toUIMessageStreamResponse();
}
