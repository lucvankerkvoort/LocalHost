export class TripVersionConflictError extends Error {
  readonly expectedVersion: number;
  readonly currentVersion: number;

  constructor(expectedVersion: number, currentVersion: number) {
    super(`Trip version mismatch. expected=${expectedVersion}, current=${currentVersion}`);
    this.name = 'TripVersionConflictError';
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}

export function resolveNextTripVersion(input: {
  currentVersion: number;
  expectedVersion?: number;
}) {
  if (
    typeof input.expectedVersion === 'number' &&
    Number.isInteger(input.expectedVersion) &&
    input.expectedVersion !== input.currentVersion
  ) {
    throw new TripVersionConflictError(input.expectedVersion, input.currentVersion);
  }

  return {
    currentVersion: input.currentVersion,
    nextVersion: input.currentVersion + 1,
  };
}
