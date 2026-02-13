import { StreamTextResult, type ToolSet, Output } from 'ai';

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

export type AgentStreamResult = StreamTextResult<
  ToolSet,
  ReturnType<typeof Output.text>
>;

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
  process(
    messages: Array<{ role?: string; content?: unknown }>,
    context: AgentContext
  ): Promise<AgentStreamResult>;
}
