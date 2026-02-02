export type AgentSpec = {
  name: string;
  purpose: string;
  allowed_actions: string[];
  forbidden_actions: string[];
  required_inputs: string[];
  output_contract: string;
};

export type SkillSpec = {
  name: string;
  inputs: string;
  assumptions: string[];
  outputs: string;
  cannot_do: string[];
};

export type ExecutionContract = {
  activeAgent: string;
  enabledSkills: string[];
  expectedOutput?: string;
};

export type ValidationFailure = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type ValidationResult = {
  ok: boolean;
  failure?: ValidationFailure;
};
