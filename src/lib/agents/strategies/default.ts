import type { AgentStrategy } from './types';

export const defaultStrategy: AgentStrategy = {
  id: 'default',
  systemPromptSection: '',
  allowedTools: [
    'semanticSearch',
    'generateItinerary',
    'getCurrentItinerary',
    'updateItinerary',
    'navigate',
    'saveUserProfile',
    'flyToLocation',
  ],
};
