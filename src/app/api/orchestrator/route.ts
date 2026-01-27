import { NextRequest, NextResponse } from 'next/server';
import { ItineraryOrchestrator } from '@/lib/ai/orchestrator';
import { getDefaultRegistry } from '@/lib/ai/tools';
import { TripSession, HostMarker } from '@/lib/ai/trip-session';
import { getOrchestratorJob } from '@/lib/ai/orchestrator-jobs';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for complex itineraries

// In-memory session store (would be Redis/DB in production)
const sessionStore = new Map<string, TripSession>();

/**
 * POST /api/orchestrator
 * 
 * Handle user messages with session context.
 * Routes to appropriate handler based on classified intent.
 * 
 * Request body:
 * {
 *   prompt: string;      // User message
 *   sessionId?: string;  // Optional existing session ID
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   session: TripSession;
 *   response: string;      // AI response message
 *   plan?: ItineraryPlan;
 *   hostMarkers?: HostMarker[];
 *   intent?: string;
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, sessionId } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid prompt' },
        { status: 400 }
      );
    }

    // Retrieve existing session if provided
    let existingSession: TripSession | null = null;
    if (sessionId && sessionStore.has(sessionId)) {
      existingSession = sessionStore.get(sessionId) || null;
    }

    // Track tool calls and callbacks
    const toolCalls: { tool: string; params: unknown; success: boolean; result?: unknown }[] = [];
    let classifiedIntent: string | undefined;
    let foundHosts: HostMarker[] = [];

    const orchestrator = new ItineraryOrchestrator(
      getDefaultRegistry(),
      {
        onToolCall: (toolName, params) => {
          console.log(`[API] Tool call: ${toolName}`);
          toolCalls.push({ tool: toolName, params, success: true });
        },
        onToolResult: (toolName, result) => {
          const lastCall = toolCalls[toolCalls.length - 1];
          if (lastCall && lastCall.tool === toolName) {
            lastCall.success = (result as { success: boolean }).success;
            if (toolName === 'resolve_place') {
              lastCall.result = result;
            }
          }
        },
        onDraftComplete: (draft) => {
          console.log(`[API] Draft complete: ${draft.days.length} days`);
        },
        onDayProcessed: (dayNum, total) => {
          console.log(`[API] Processed day ${dayNum}/${total}`);
        },
        onIntentClassified: (intent, reason) => {
          console.log(`[API] Intent: ${intent} - ${reason}`);
          classifiedIntent = intent;
        },
        onHostsFound: (hosts) => {
          console.log(`[API] Found ${hosts.length} hosts`);
          foundHosts = hosts;
        },
      }
    );

    // Use the new session-aware handleMessage
    const { session, response } = await orchestrator.handleMessage(prompt, existingSession);

    // Store updated session
    sessionStore.set(session.id, session);

    // Debug logging for hostMarkers
    const hostMarkersToReturn = foundHosts.length > 0 ? foundHosts : session.suggestedHosts;
    console.log(`[API] Returning hostMarkers: ${hostMarkersToReturn?.length ?? 0} markers`);
    console.log(`[API]   - foundHosts: ${foundHosts.length}`);
    console.log(`[API]   - session.suggestedHosts: ${session.suggestedHosts?.length ?? 0}`);

    return NextResponse.json({
      success: true,
      session,
      response,
      plan: session.plan,
      hostMarkers: hostMarkersToReturn,
      intent: classifiedIntent,
      toolCalls,
    });
  } catch (error) {
    console.error('[API] Orchestrator error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/orchestrator
 * 
 * List available tools in the registry.
 */
export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId');
  if (jobId) {
    const job = getOrchestratorJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        updatedAt: job.updatedAt,
        plan: job.status === 'complete' ? job.plan : undefined,
        hostMarkers: job.status === 'complete' ? job.hostMarkers : undefined,
        error: job.status === 'error' ? job.error : undefined,
      },
    });
  }

  const registry = getDefaultRegistry();
  const tools = registry.listTools();

  return NextResponse.json({
    success: true,
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
    })),
  });
}
