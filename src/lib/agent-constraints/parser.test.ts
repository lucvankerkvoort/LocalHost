import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadAgentSpecs, loadSkillSpecs } from './parser';

async function withTempCwd(
  files: Record<string, string>,
  fn: () => void | Promise<void>
) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localhost-agent-parser-'));
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

test(
  'loadAgentSpecs parses list fields and applies defaults for missing fields',
  { concurrency: false },
  async () => {
    await withTempCwd(
      {
        'AGENTS.md': `
# AGENTS

## Architect
name: Architect
purpose: Define system structure and invariants
allowed_actions:
- Propose schemas, data flow, boundaries
forbidden_actions:
- Writing production code
required_inputs:
- Problem statement
output_contract: Markdown spec only

## Minimal
purpose: Bare minimum agent
`,
      },
      () => {
        const specs = loadAgentSpecs();

        assert.equal(specs.Architect.name, 'Architect');
        assert.deepEqual(specs.Architect.allowed_actions, [
          'Propose schemas, data flow, boundaries',
        ]);
        assert.deepEqual(specs.Architect.forbidden_actions, [
          'Writing production code',
        ]);
        assert.deepEqual(specs.Architect.required_inputs, ['Problem statement']);
        assert.equal(specs.Architect.output_contract, 'Markdown spec only');

        assert.equal(specs.Minimal.name, 'Minimal');
        assert.equal(specs.Minimal.purpose, 'Bare minimum agent');
        assert.deepEqual(specs.Minimal.allowed_actions, []);
        assert.deepEqual(specs.Minimal.forbidden_actions, []);
        assert.deepEqual(specs.Minimal.required_inputs, []);
        assert.equal(specs.Minimal.output_contract, '');
      }
    );
  }
);

test(
  'loadSkillSpecs parses list fields and applies defaults for missing fields',
  { concurrency: false },
  async () => {
    await withTempCwd(
      {
        'SKILLS.md': `
# SKILLS

## skill-installer
name: skill-installer
inputs: repo path
assumptions:
- Git is installed
outputs: Installed skills
cannot_do:
- Modify repository code

## minimal-skill
name: minimal-skill
`,
      },
      () => {
        const specs = loadSkillSpecs();

        assert.equal(specs['skill-installer'].name, 'skill-installer');
        assert.equal(specs['skill-installer'].inputs, 'repo path');
        assert.deepEqual(specs['skill-installer'].assumptions, ['Git is installed']);
        assert.equal(specs['skill-installer'].outputs, 'Installed skills');
        assert.deepEqual(specs['skill-installer'].cannot_do, [
          'Modify repository code',
        ]);

        assert.equal(specs['minimal-skill'].name, 'minimal-skill');
        assert.equal(specs['minimal-skill'].inputs, '');
        assert.deepEqual(specs['minimal-skill'].assumptions, []);
        assert.equal(specs['minimal-skill'].outputs, '');
        assert.deepEqual(specs['minimal-skill'].cannot_do, []);
      }
    );
  }
);

test(
  'loadAgentSpecs throws when AGENTS.md is missing',
  { concurrency: false },
  async () => {
    await withTempCwd({}, () => {
      assert.throws(() => loadAgentSpecs(), /ENOENT|no such file or directory/i);
    });
  }
);

test(
  'loadSkillSpecs throws when SKILLS.md is missing',
  { concurrency: false },
  async () => {
    await withTempCwd({}, () => {
      assert.throws(() => loadSkillSpecs(), /ENOENT|no such file or directory/i);
    });
  }
);

