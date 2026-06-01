export interface AgentStrategy {
  id: 'region-explorer' | 'road-trip' | 'multi-country' | 'default';
  /** Injected into plannerDirective to shape LLM behavior for this mode. */
  systemPromptSection: string;
}
