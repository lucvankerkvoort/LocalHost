import { convertToModelMessages } from 'ai';
import { agentRouter } from '@/lib/conversation/router';
import { conversationController } from '@/lib/conversation/controller';
import { validateAgentOutput, withExecution } from '@/lib/agent-constraints';
import type { HostOnboardingStage } from '@/lib/agents/agent';

export const maxDuration = 300; // Allow 5 minutes for generation

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
  const body = await req.json();
  const { messages, id, tripId } = body;
  
  // Validate messages
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Convert UIMessage[] from client to CoreMessage[] for streamText
  const modelMessages = await convertToModelMessages(messages);

  // Check if intent was explicitly provided in the request body
  const requestedIntent = body.intent;
  
  // Determine intent (routing)
  // If explicitly provided (e.g., from become-host page), use that. Otherwise, let router decide.
  const intent = requestedIntent || await agentRouter.route(modelMessages);
  
  // Get the appropriate agent
  const agent = agentRouter.getAgent(intent);
  
  console.log(`[API] Routing to agent: ${agent.name} (intent: ${intent})`);

  // Delegate processing to the agent
  const execution = body.execution as {
    activeAgent: string;
    enabledSkills: string[];
    expectedOutput?: string;
  } | undefined;
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

  const onboardingStage = parseOnboardingStage(body.onboardingStage);
  const runAgent = () => agent.process(modelMessages, { sessionId: id, onboardingStage, tripId });
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
