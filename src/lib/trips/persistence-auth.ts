export type TripPlanWriteAuthMode = 'user' | 'internal';

export type TripPlanWriteAuthDecision =
  | { allowed: true }
  | { allowed: false; reason: 'not_found' | 'forbidden' | 'owner_mismatch' };

export function decideTripPlanWriteAccess(params: {
  mode: TripPlanWriteAuthMode;
  tripExists: boolean;
  tripOwnerUserId?: string | null;
  userId?: string | null;
  expectedTripOwnerUserId?: string | null;
}): TripPlanWriteAuthDecision {
  const {
    mode,
    tripExists,
    tripOwnerUserId = null,
    userId = null,
    expectedTripOwnerUserId = null,
  } = params;

  if (!tripExists) {
    return { allowed: false, reason: 'not_found' };
  }

  if (mode === 'user') {
    if (!userId || !tripOwnerUserId || userId !== tripOwnerUserId) {
      return { allowed: false, reason: 'forbidden' };
    }
    return { allowed: true };
  }

  if (expectedTripOwnerUserId && tripOwnerUserId !== expectedTripOwnerUserId) {
    return { allowed: false, reason: 'owner_mismatch' };
  }

  return { allowed: true };
}

