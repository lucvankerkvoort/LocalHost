export type AtomicOrchestratorJobWhereInput = {
  id: string;
  OR?: Array<{ generationId: string | null }>;
  NOT?: { status: { in: string[] } };
};

function isTerminalStatus(status: string | undefined): boolean {
  return status === 'complete' || status === 'error';
}

export function buildAtomicOrchestratorJobUpdateWhere(params: {
  id: string;
  expectedGenerationId?: string;
  nextStatus?: string;
}): AtomicOrchestratorJobWhereInput {
  const { id, expectedGenerationId, nextStatus } = params;
  const where: AtomicOrchestratorJobWhereInput = { id };

  // Preserve current compatibility behavior: allow generation-less legacy rows,
  // otherwise require the expected generation to match.
  if (expectedGenerationId) {
    where.OR = [{ generationId: expectedGenerationId }, { generationId: null }];
  }

  // Non-terminal writes must not overwrite terminal rows.
  if (!isTerminalStatus(nextStatus)) {
    where.NOT = { status: { in: ['complete', 'error'] } };
  }

  return where;
}

export function classifyOrchestratorJobUpdateRejectReason(params: {
  row:
    | {
        generationId: string | null;
        status: string;
      }
    | null;
  expectedGenerationId?: string;
  nextStatus?: string;
}): 'generation_mismatch' | 'terminal_state_protection' | 'not_found' | 'guard_rejected' {
  const { row, expectedGenerationId, nextStatus } = params;
  if (!row) return 'not_found';
  if (expectedGenerationId && row.generationId && expectedGenerationId !== row.generationId) {
    return 'generation_mismatch';
  }
  if (!isTerminalStatus(nextStatus) && (row.status === 'complete' || row.status === 'error')) {
    return 'terminal_state_protection';
  }
  return 'guard_rejected';
}

