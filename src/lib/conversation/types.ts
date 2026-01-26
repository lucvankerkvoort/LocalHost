export type AgentIntent = 'general' | 'plan_trip' | 'become_host';

export interface ConversationSession {
  id: string;
  intent: AgentIntent;
  lastActiveAt: number;
  metadata?: Record<string, any>;
}
