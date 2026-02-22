export type AgentIntent = 'general' | 'plan_trip' | 'become_host' | 'profile_setup';

export interface ConversationSession {
  id: string;
  intent: AgentIntent;
  lastActiveAt: number;
  metadata?: Record<string, unknown>;
}
