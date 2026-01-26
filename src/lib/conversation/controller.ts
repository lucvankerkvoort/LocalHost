import { ConversationSession, AgentIntent } from './types';

export class ConversationController {
  // In a real app, this would be backed by Redis or a database
  private sessions: Map<string, ConversationSession> = new Map();

  getOrCreateSession(sessionId: string): ConversationSession {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        intent: 'general',
        lastActiveAt: Date.now(),
      });
    }
    return this.sessions.get(sessionId)!;
  }

  updateIntent(sessionId: string, intent: AgentIntent) {
    const session = this.getOrCreateSession(sessionId);
    session.intent = intent;
    session.lastActiveAt = Date.now();
    this.sessions.set(sessionId, session);
  }

  getSession(sessionId: string): ConversationSession | undefined {
    return this.sessions.get(sessionId);
  }
}

// Singleton instance for now (note: Next.js serverless functions might reset this state, 
// so this only works for the duration of the process or if the lambda stays warm. 
// For production, use a proper store.)
export const conversationController = new ConversationController();
