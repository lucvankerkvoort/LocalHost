import fs from 'node:fs';
import path from 'node:path';

import { AgentSpec, SkillSpec } from './types';

type RawSpec = Record<string, string | string[]>;

const LIST_KEYS = new Set(['allowed_actions', 'forbidden_actions', 'required_inputs', 'assumptions', 'cannot_do']);

function parseMarkdownSpecs(markdown: string): Record<string, RawSpec> {
  const lines = markdown.split(/\r?\n/);
  const specs: Record<string, RawSpec> = {};
  let currentName: string | null = null;
  let currentKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('## ')) {
      currentName = line.slice(3).trim();
      specs[currentName] = {};
      currentKey = null;
      continue;
    }
    if (!currentName || line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const keyMatch = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1];
      const value = keyMatch[2].trim();
      if (LIST_KEYS.has(key)) {
        specs[currentName][key] = [];
        currentKey = key;
      } else {
        specs[currentName][key] = value;
        currentKey = null;
      }
      continue;
    }
    if (currentKey && line.startsWith('- ')) {
      const entry = line.slice(2).trim();
      const list = specs[currentName][currentKey] as string[];
      list.push(entry);
    }
  }

  return specs;
}

function readMarkdownFile(fileName: string): string {
  const filePath = path.resolve(process.cwd(), fileName);
  return fs.readFileSync(filePath, 'utf8');
}

export function loadAgentSpecs(): Record<string, AgentSpec> {
  const markdown = readMarkdownFile('AGENTS.md');
  const raw = parseMarkdownSpecs(markdown);
  const specs: Record<string, AgentSpec> = {};

  for (const [name, data] of Object.entries(raw)) {
    specs[name] = {
      name: String(data.name ?? name),
      purpose: String(data.purpose ?? ''),
      allowed_actions: (data.allowed_actions as string[]) ?? [],
      forbidden_actions: (data.forbidden_actions as string[]) ?? [],
      required_inputs: (data.required_inputs as string[]) ?? [],
      output_contract: String(data.output_contract ?? ''),
    };
  }

  return specs;
}

export function loadSkillSpecs(): Record<string, SkillSpec> {
  const markdown = readMarkdownFile('SKILLS.md');
  const raw = parseMarkdownSpecs(markdown);
  const specs: Record<string, SkillSpec> = {};

  for (const [name, data] of Object.entries(raw)) {
    specs[name] = {
      name: String(data.name ?? name),
      inputs: String(data.inputs ?? ''),
      assumptions: (data.assumptions as string[]) ?? [],
      outputs: String(data.outputs ?? ''),
      cannot_do: (data.cannot_do as string[]) ?? [],
    };
  }

  return specs;
}
