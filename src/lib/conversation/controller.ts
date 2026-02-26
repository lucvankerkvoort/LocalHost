import { prisma } from '@/lib/prisma';
import { ConversationSession, AgentIntent } from './types';

/**
 * DB-backed conversation session controller.
 * Replaces the previous in-memory Map implementation so session intent
 * survives serverless cold starts and multi-instance deployments.
 */

export async function getOrCreateSession(sessionId: string): Promise<ConversationSession> {
  const row = await prisma.conversationSession.upsert({
    where: { id: sessionId },
    create: {
      id: sessionId,
      intent: 'general',
    },
    update: {},
  });

  return {
    id: row.id,
    intent: row.intent as AgentIntent,
    lastActiveAt: row.updatedAt.getTime(),
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
  };
}

export async function updateIntent(sessionId: string, intent: AgentIntent): Promise<void> {
  await prisma.conversationSession.upsert({
    where: { id: sessionId },
    create: {
      id: sessionId,
      intent,
    },
    update: {
      intent,
    },
  });
}

export async function getSession(sessionId: string): Promise<ConversationSession | null> {
  const row = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
  });

  if (!row) return null;

  return {
    id: row.id,
    intent: row.intent as AgentIntent,
    lastActiveAt: row.updatedAt.getTime(),
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
  };
}

export async function updateMetadata(
  sessionId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await prisma.conversationSession.upsert({
    where: { id: sessionId },
    create: {
      id: sessionId,
      intent: 'general',
      metadata,
    },
    update: {
      metadata,
    },
  });
}

// Backward-compatible class wrapper (delegates to the functions above)
export class ConversationController {
  async getOrCreateSession(sessionId: string): Promise<ConversationSession> {
    return getOrCreateSession(sessionId);
  }

  async updateIntent(sessionId: string, intent: AgentIntent): Promise<void> {
    return updateIntent(sessionId, intent);
  }

  async getSession(sessionId: string): Promise<ConversationSession | null> {
    return getSession(sessionId);
  }

  async updateMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<void> {
    return updateMetadata(sessionId, metadata);
  }
}

export const conversationController = new ConversationController();
