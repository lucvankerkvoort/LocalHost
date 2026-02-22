export const HOST_ONBOARDING_START_TOKEN = 'ACTION:START_HOST_ONBOARDING';
export const PLANNER_ONBOARDING_START_TOKEN = 'ACTION:START_PLANNER';
export const PROFILE_SETUP_START_TOKEN = 'ACTION:START_PROFILE_SETUP';
export const HANDSHAKE_STORAGE_PREFIX = 'chat-handshake:';

export type ChatWidgetIntent = 'general' | 'become_host' | 'profile_setup';
export type HostOnboardingStage =
  | 'CITY_MISSING'
  | 'STOPS_MISSING'
  | 'DETAILS_MISSING'
  | 'READY_FOR_ASSIST';

export type HostDraftSnapshot = {
  city?: string | null;
  stops?: Array<unknown> | null;
  title?: string | null;
  shortDesc?: string | null;
  longDesc?: string | null;
  duration?: number | null;
};

type HandshakeCheckInput = {
  intent: ChatWidgetIntent;
  isActive: boolean;
  pathname: string | null;
  messageCount: number;
  alreadyTriggered: boolean;
  isDraftReady?: boolean;
};

export function shouldStartHostOnboardingHandshake(input: HandshakeCheckInput): boolean {
  if (!input.isActive) return false;
  if (input.intent !== 'become_host') return false;
  if (!input.pathname?.startsWith('/become-host')) return false;
  if (!input.isDraftReady) return false;
  if (input.messageCount > 0) return false;
  if (input.alreadyTriggered) return false;
  return true;
}

export function shouldStartPlannerHandshake(input: HandshakeCheckInput): boolean {
  if (!input.isActive) return false;
  if (input.intent !== 'general') return false;
  if (!input.pathname?.startsWith('/trips/')) return false;
  if (input.messageCount > 0) return false;
  if (input.alreadyTriggered) return false;
  return true;
}

export function shouldStartProfileHandshake(input: HandshakeCheckInput): boolean {
  if (!input.isActive) return false;
  if (input.intent !== 'profile_setup') return false;
  if (!input.pathname?.startsWith('/profile/setup')) return false;
  if (input.messageCount > 0) return false;
  if (input.alreadyTriggered) return false;
  return true;
}

export function getChatIntent(pathname: string | null, intentOverride?: ChatWidgetIntent): ChatWidgetIntent {
  if (intentOverride) return intentOverride;
  if (pathname?.startsWith('/become-host')) return 'become_host';
  if (pathname?.startsWith('/profile/setup')) return 'profile_setup';
  return 'general';
}

export function getChatId(
  intent: ChatWidgetIntent,
  pathname: string | null,
  tripId?: string | null
): string {
  if (intent !== 'become_host') {
    const trimmedTripId = tripId?.trim();
    return trimmedTripId ? `chat-${intent}-${trimmedTripId}` : `chat-${intent}`;
  }
  const draftId = getHostDraftIdFromPath(pathname);
  return draftId ? `chat-${intent}-${draftId}` : `chat-${intent}`;
}

export function getHostDraftIdFromPath(pathname: string | null): string | null {
  if (!pathname?.startsWith('/become-host/')) return null;
  return pathname.split('/').filter(Boolean)[1] ?? null;
}

export function buildHostOnboardingTrigger(stage: HostOnboardingStage): string {
  return `${HOST_ONBOARDING_START_TOKEN}:${stage}`;
}

export function buildPlannerOnboardingTrigger(): string {
  return PLANNER_ONBOARDING_START_TOKEN;
}

export function buildProfileSetupTrigger(): string {
  return PROFILE_SETUP_START_TOKEN;
}

const HOST_TOOL_ONLY_FOLLOW_UP_BY_STAGE: Record<HostOnboardingStage, string> = {
  CITY_MISSING: 'Great start - what city are you hosting in?',
  STOPS_MISSING: 'Nice - what should be your first meaningful stop?',
  DETAILS_MISSING: 'Want me to draft your title and descriptions from your current stops?',
  READY_FOR_ASSIST: 'Everything core is set - what should we refine next?',
};

export function getHostToolOnlyFallbackQuestion(stage: HostOnboardingStage): string {
  return HOST_TOOL_ONLY_FOLLOW_UP_BY_STAGE[stage];
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function resolveHostOnboardingStage(draft: HostDraftSnapshot): HostOnboardingStage {
  if (!hasText(draft.city)) return 'CITY_MISSING';

  const stopCount = draft.stops?.length ?? 0;
  if (stopCount === 0) return 'STOPS_MISSING';

  if (!hasText(draft.title) || !hasText(draft.shortDesc) || !hasText(draft.longDesc)) {
    return 'DETAILS_MISSING';
  }

  return 'READY_FOR_ASSIST';
}
