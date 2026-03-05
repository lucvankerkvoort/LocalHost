function resolveModel(name: string, fallback: string): string {
  const raw = process.env[name];
  const value = raw?.trim();
  return value && value.length > 0 ? value : fallback;
}

export const OPENAI_DEFAULT_MODEL = resolveModel('OPENAI_DEFAULT_MODEL', 'gpt-5.2');

export const OPENAI_PLANNING_MODEL = OPENAI_DEFAULT_MODEL;
export const OPENAI_HOST_CREATION_MODEL = OPENAI_DEFAULT_MODEL;
export const OPENAI_ORCHESTRATOR_MODEL = OPENAI_DEFAULT_MODEL;
export const OPENAI_HOST_DRAFT_MODEL = OPENAI_DEFAULT_MODEL;
export const OPENAI_PROFILE_AGENT_MODEL = OPENAI_DEFAULT_MODEL;
export const OPENAI_IMAGE_RERANK_MODEL = resolveModel(
  'OPENAI_IMAGE_RERANK_MODEL',
  'gpt-4o-mini'
);
