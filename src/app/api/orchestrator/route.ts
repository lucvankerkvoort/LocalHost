import { after, NextRequest, NextResponse } from 'next/server';
import { ItineraryOrchestrator } from '@/lib/ai/orchestrator';
import { getDefaultRegistry } from '@/lib/ai/tools';
import { TripSession, HostMarker } from '@/lib/ai/trip-session';
import { getOrchestratorJob } from '@/lib/ai/orchestrator-jobs';
import { auth } from '@/auth';
import { rateLimit } from '@/lib/api/rate-limit';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for complex itineraries

// Rate limit: 10 requests per minute per IP (orchestrator is expensive)
const orchestratorLimiter = rateLimit({ interval: 60_000, limit: 10 });

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
  // Auth check
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }
  const userId = authSession.user.id;

  // Rate limit check
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const { success: withinLimit, resetAt } = await orchestratorLimiter.check(ip);
  if (!withinLimit) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body = await request.json();
    const { prompt, sessionId } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid prompt' },
        { status: 400 }
      );
    }

    // Retrieve existing session from DB
    let existingSession: TripSession | null = null;
    if (sessionId) {
      const stored = await prisma.orchestratorSession.findUnique({
        where: { id: sessionId },
      });
      if (stored) {
        existingSession = stored.data as unknown as TripSession;
      }
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

    // Persist session to DB after response is sent (non-blocking)
    after(async () => {
      try {
        await prisma.orchestratorSession.upsert({
          where: { id: session.id },
          create: {
            id: session.id,
            userId,
            data: session as unknown as Record<string, unknown>,
          },
          update: {
            data: session as unknown as Record<string, unknown>,
          },
        });
      } catch (err) {
        console.error('[API] Failed to persist orchestrator session:', err);
      }
    });

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
 * Retrieve job status by jobId, or list available tools.
 */
export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId');
  if (jobId) {
    try {
      const job = await getOrchestratorJob(jobId);
      if (!job) {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          job: {
            id: job.id,
            status: job.status,
            generationId: job.generationId,
            generationMode: job.generationMode,
            progress: job.progress,
            updatedAt: job.updatedAt,
            plan: job.plan,
            hostMarkers: job.hostMarkers,
            error: job.status === 'error' ? job.error : undefined,
          },
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    } catch (error) {
      console.error('[API] Orchestrator job lookup error:', error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load planner status',
        },
        { status: 500 }
      );
    }
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
