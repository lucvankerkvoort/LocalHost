export type StrategyToolName =
  | 'semanticSearch'
  | 'generateItinerary'
  | 'getCurrentItinerary'
  | 'updateItinerary'
  | 'navigate'
  | 'saveUserProfile'
  | 'flyToLocation';

export interface AgentStrategy {
  id: 'region-explorer' | 'road-trip' | 'multi-country' | 'default';
  /** Injected into plannerDirective to shape LLM behavior for this mode. */
  systemPromptSection: string;
  /** Tools available to the LLM for this strategy. */
  allowedTools: StrategyToolName[];
}
