import { Agent } from '../agents/agent';
import { AgentIntent } from './types';
import { PlanningAgent } from '../agents/planning-agent';
import { HostCreationAgent } from '../agents/host-creation-agent';
import { ProfileAgent } from '../agents/profile-agent';

export class AgentRouter {
  private agents: Map<string, Agent> = new Map();

  constructor() {
    const planningAgent = new PlanningAgent();
    const hostCreationAgent = new HostCreationAgent();
    const profileAgent = new ProfileAgent();

    // Register agents
    this.registerAgent('plan_trip', planningAgent);
    this.registerAgent('become_host', hostCreationAgent);
    this.registerAgent('profile_setup', profileAgent);
    
    // Reuse planning agent as general/default for now
    this.registerAgent('general', planningAgent); 
  }

  registerAgent(intent: string, agent: Agent) {
    this.agents.set(intent, agent);
  }

  getAgent(intent: AgentIntent): Agent {
    const agent = this.agents.get(intent);
    if (!agent) {
      // Fallback to general
      const general = this.agents.get('general');
      if (!general) throw new Error('No general agent configured');
      return general;
    }
    return agent;
  }
  
  /**
   * Determine intent from the message history or context
   */
  async route(messages: Array<{ role?: string; content?: unknown }>): Promise<AgentIntent> {
    void messages;
    // TODO: Implement actual router (LLM or regex)
    // For now, always return generic, which maps to PlanningAgent
    return 'general';
  }
}

// Singleton instance
export const agentRouter = new AgentRouter();
