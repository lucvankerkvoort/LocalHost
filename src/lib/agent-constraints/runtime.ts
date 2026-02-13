import { AsyncLocalStorage } from 'node:async_hooks';

import { loadAgentSpecs, loadSkillSpecs } from './parser';
import { AgentSpec, ExecutionContract, ValidationResult } from './types';

type ExecutionState = {
  agent: AgentSpec;
  enabledSkills: Set<string>;
};

const executionStore = new AsyncLocalStorage<ExecutionState>();

const FORBIDDEN_LANGUAGE = [
  'should',
  'might',
  'try',
  'possibly',
  'one approach',
  'another option',
];

function buildFailure(code: string, message: string, details?: Record<string, unknown>): ValidationResult {
  return { ok: false, failure: { code, message, details } };
}

export function validateExecutionContract(contract: ExecutionContract): ValidationResult {
  if (!contract || !contract.activeAgent) {
    return buildFailure('missing_agent', 'activeAgent is required');
  }
  if (!Array.isArray(contract.enabledSkills)) {
    return buildFailure('missing_skills', 'enabledSkills must be provided');
  }
  const agents = loadAgentSpecs();
  const skills = loadSkillSpecs();

  const agent = agents[contract.activeAgent];
  if (!agent) {
    return buildFailure('unknown_agent', `Unknown agent: ${contract.activeAgent}`);
  }

  const unknownSkills = contract.enabledSkills.filter((skill) => !skills[skill]);
  if (unknownSkills.length > 0) {
    return buildFailure('unknown_skill', 'Unknown skills in enabledSkills', { unknownSkills });
  }

  if (contract.expectedOutput && contract.expectedOutput !== agent.output_contract) {
    return buildFailure('output_contract_mismatch', 'expectedOutput must match agent output_contract', {
      expectedOutput: contract.expectedOutput,
      outputContract: agent.output_contract,
    });
  }

  return { ok: true };
}

export async function withExecution<T>(
  contract: ExecutionContract,
  fn: () => Promise<T>
): Promise<T> {
  const validation = validateExecutionContract(contract);
  if (!validation.ok) {
    const error = new Error(validation.failure?.message || 'Execution contract validation failed') as Error & {
      failure?: ValidationResult['failure'];
    };
    error.failure = validation.failure;
    throw error;
  }

  const agents = loadAgentSpecs();
  const agent = agents[contract.activeAgent];
  const enabledSkills = new Set(contract.enabledSkills);

  return executionStore.run({ agent, enabledSkills }, fn);
}

export function requireSkill(skillName: string) {
  const state = executionStore.getStore();
  if (!state) {
    throw new Error('No active execution context for skill enforcement');
  }
  if (!state.enabledSkills.has(skillName)) {
    throw new Error(`Skill not enabled: ${skillName}`);
  }
}

function validateOutputContract(contract: string, output: string): ValidationResult {
  if (contract === 'Markdown spec only') {
    if (!/^#{1,6}\s+\S/m.test(output)) {
      return buildFailure('invalid_markdown', 'Output must include at least one markdown heading');
    }
    return { ok: true };
  }

  if (contract === 'Unified diff only') {
    const hasDiffHeader = /^diff --git /m.test(output);
    const hasHunks = /^@@ /m.test(output);
    const hasFileHeaders = /^--- /m.test(output) && /^\+\+\+ /m.test(output);
    if (!hasDiffHeader && !(hasFileHeaders && hasHunks)) {
      return buildFailure('invalid_diff', 'Output must be a unified diff');
    }
    return { ok: true };
  }

  if (contract === 'Structured failure analysis (Failure, Evidence, Root Cause)') {
    const hasFailure = /\bFailure\b/i.test(output);
    const hasEvidence = /\bEvidence\b/i.test(output);
    const hasRootCause = /\bRoot Cause\b/i.test(output);
    if (!hasFailure || !hasEvidence || !hasRootCause) {
      return buildFailure('invalid_failure_analysis', 'Output must include Failure, Evidence, and Root Cause sections');
    }
    return { ok: true };
  }

  if (contract === 'Pass/Fail with reasons') {
    const hasPassFail = /^(PASS|FAIL)\b/m.test(output);
    const hasReasons = /\bReasons\b/i.test(output);
    if (!hasPassFail || !hasReasons) {
      return buildFailure('invalid_review', 'Output must start with PASS/FAIL and include Reasons');
    }
    return { ok: true };
  }

  return buildFailure('unknown_output_contract', `Unknown output contract: ${contract}`);
}

export function validateAgentOutput(agentName: string, output: string): ValidationResult {
  const agents = loadAgentSpecs();
  const agent = agents[agentName];
  if (!agent) {
    return buildFailure('unknown_agent', `Unknown agent: ${agentName}`);
  }

  const forbidden = FORBIDDEN_LANGUAGE.filter((term) =>
    new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'i').test(output)
  );
  if (forbidden.length > 0) {
    return buildFailure('forbidden_language', 'Output contains forbidden tentative language', {
      forbidden,
    });
  }

  return validateOutputContract(agent.output_contract, output);
}
