export type SyntheticBotsProfile = 'dev-lite' | 'demo-rich' | 'staging-e2e';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return TRUE_VALUES.has(value.toLowerCase());
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readProfile(): SyntheticBotsProfile {
  const raw = process.env.SYNTHETIC_BOTS_PROFILE;
  if (raw === 'dev-lite' || raw === 'demo-rich' || raw === 'staging-e2e') {
    return raw;
  }
  return 'dev-lite';
}

export function getSyntheticBotsConfig() {
  const enabled = envBool('SYNTHETIC_BOTS_ENABLED', false);
  const maxRetries = Math.max(0, envInt('SYNTHETIC_BOTS_MAX_RETRIES', 3));

  return {
    enabled,
    profile: readProfile(),
    useLlm: envBool('SYNTHETIC_BOTS_USE_LLM', false),
    maxRetries,
  };
}
