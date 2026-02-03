import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  requireSkill,
  validateAgentOutput,
  validateExecutionContract,
  withExecution,
} from './runtime';

async function withTempCwd(
  files: Record<string, string>,
  fn: () => void | Promise<void>
) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localhost-agent-runtime-'));
  const previousCwd = process.cwd();

  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(tempDir, name), content, 'utf8');
    }
    process.chdir(tempDir);
    await fn();
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const AGENTS_FIXTURE = `
# AGENTS

## Architect
name: Architect
purpose: Define structure
allowed_actions:
- Propose schemas
forbidden_actions:
- Writing production code
required_inputs:
- Problem statement
output_contract: Markdown spec only

## Implementer
name: Implementer
purpose: Write code
allowed_actions:
- Edit files
forbidden_actions:
- Changing architecture
required_inputs:
- Explicit spec
output_contract: Unified diff only

## Debugger
name: Debugger
purpose: Analyze failures
output_contract: Structured failure analysis (Failure, Evidence, Root Cause)

## Reviewer
name: Reviewer
purpose: Validate invariants
output_contract: Pass/Fail with reasons
`;

const SKILLS_FIXTURE = `
# SKILLS

## skill-installer
name: skill-installer
inputs: repository path
outputs: installed skills

## skill-creator
name: skill-creator
inputs: request
outputs: skill docs
`;

test(
  'validateExecutionContract rejects missing or unknown entities',
  { concurrency: false },
  async () => {
    await withTempCwd(
      {
        'AGENTS.md': AGENTS_FIXTURE,
        'SKILLS.md': SKILLS_FIXTURE,
      },
      () => {
        const invalidContract = {} as unknown as Parameters<
          typeof validateExecutionContract
        >[0];
        assert.equal(validateExecutionContract(invalidContract).ok, false);

        const unknownAgent = validateExecutionContract({
          activeAgent: 'Unknown',
          enabledSkills: [],
        });
        assert.equal(unknownAgent.ok, false);
        assert.equal(unknownAgent.failure?.code, 'unknown_agent');

        const unknownSkill = validateExecutionContract({
          activeAgent: 'Implementer',
          enabledSkills: ['not-a-skill'],
        });
        assert.equal(unknownSkill.ok, false);
        assert.equal(unknownSkill.failure?.code, 'unknown_skill');
      }
    );
  }
);

test(
  'validateExecutionContract enforces expected output contract match',
  { concurrency: false },
  async () => {
    await withTempCwd(
      {
        'AGENTS.md': AGENTS_FIXTURE,
        'SKILLS.md': SKILLS_FIXTURE,
      },
      () => {
        const mismatch = validateExecutionContract({
          activeAgent: 'Implementer',
          enabledSkills: ['skill-installer'],
          expectedOutput: 'Markdown spec only',
        });
        assert.equal(mismatch.ok, false);
        assert.equal(mismatch.failure?.code, 'output_contract_mismatch');

        const ok = validateExecutionContract({
          activeAgent: 'Implementer',
          enabledSkills: ['skill-installer'],
          expectedOutput: 'Unified diff only',
        });
        assert.equal(ok.ok, true);
      }
    );
  }
);

test(
  'withExecution establishes context and requireSkill enforces enabled skills',
  { concurrency: false },
  async () => {
    await withTempCwd(
      {
        'AGENTS.md': AGENTS_FIXTURE,
        'SKILLS.md': SKILLS_FIXTURE,
      },
      async () => {
        const value = await withExecution(
          {
            activeAgent: 'Implementer',
            enabledSkills: ['skill-installer'],
            expectedOutput: 'Unified diff only',
          },
          async () => {
            requireSkill('skill-installer');
            return 42;
          }
        );
        assert.equal(value, 42);

        await assert.rejects(
          () =>
            withExecution(
              {
                activeAgent: 'Implementer',
                enabledSkills: ['skill-installer'],
              },
              async () => {
                requireSkill('skill-creator');
              }
            ),
          /Skill not enabled: skill-creator/
        );
      }
    );
  }
);

test('requireSkill throws when no execution context exists', () => {
  assert.throws(
    () => requireSkill('skill-installer'),
    /No active execution context for skill enforcement/
  );
});

test(
  'validateAgentOutput enforces contracts and rejects forbidden language',
  { concurrency: false },
  async () => {
    await withTempCwd(
      {
        'AGENTS.md': AGENTS_FIXTURE,
        'SKILLS.md': SKILLS_FIXTURE,
      },
      () => {
        const unknown = validateAgentOutput('Unknown', '# Heading');
        assert.equal(unknown.ok, false);
        assert.equal(unknown.failure?.code, 'unknown_agent');

        const forbidden = validateAgentOutput('Architect', '# Plan\nOne approach is to ...');
        assert.equal(forbidden.ok, false);
        assert.equal(forbidden.failure?.code, 'forbidden_language');

        assert.equal(validateAgentOutput('Architect', '# Spec').ok, true);
        assert.equal(validateAgentOutput('Architect', 'plain text only').ok, false);

        const validDiff = `--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new`;
        assert.equal(validateAgentOutput('Implementer', validDiff).ok, true);
        assert.equal(validateAgentOutput('Implementer', 'not a diff').ok, false);

        const validFailure = `Failure: API failed
Evidence: stack trace
Root Cause: missing token`;
        assert.equal(validateAgentOutput('Debugger', validFailure).ok, true);
        assert.equal(validateAgentOutput('Debugger', 'Failure only').ok, false);

        const validReview = `PASS
Reasons: all invariants satisfied`;
        assert.equal(validateAgentOutput('Reviewer', validReview).ok, true);
        assert.equal(validateAgentOutput('Reviewer', 'FAIL').ok, false);
      }
    );
  }
);
