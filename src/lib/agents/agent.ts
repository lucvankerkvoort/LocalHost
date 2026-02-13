import { StreamTextResult } from 'ai';

export type HostOnboardingStage =
  | 'CITY_MISSING'
  | 'STOPS_MISSING'
  | 'DETAILS_MISSING'
  | 'READY_FOR_ASSIST';

export interface AgentContext {
  userId?: string; 
  sessionId?: string;
  tripId?: string;
  onboardingStage?: HostOnboardingStage;
}

/**
 * Interface that all Domain Agents must implement.
 * Each agent encapsulates its own system prompt, tools, and logic.
 */
export interface Agent {
  name: string;
  description: string;

  /**
   * Process a conversation history and return a streaming response.
   */
  process(messages: any[], context: AgentContext): Promise<StreamTextResult<any, any>>;
}
