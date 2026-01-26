import { StreamTextResult } from 'ai';

export interface AgentContext {
  userId?: string; 
  sessionId?: string;
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
