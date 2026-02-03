import assert from 'node:assert/strict';
import test from 'node:test';

import { z } from 'zod';

import { createTool, ToolRegistry } from './tool-registry';

function muteConsole() {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};

  return () => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  };
}

test('register and hasTool/getTool work for a valid tool', () => {
  const restore = muteConsole();
  try {
    const registry = new ToolRegistry();
    const tool = createTool({
      name: 'double',
      description: 'Doubles a number',
      parameters: z.object({ value: z.number() }),
      handler: async ({ value }) => ({ success: true, data: value * 2 }),
    });

    registry.register(tool);

    assert.equal(registry.hasTool('double'), true);
    assert.equal(registry.hasTool('missing'), false);
    assert.equal(registry.getTool('double')?.description, 'Doubles a number');
  } finally {
    restore();
  }
});

test('register warns when overwriting an existing tool', () => {
  const restore = muteConsole();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(' '));

  try {
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'echo',
        description: 'Echo v1',
        parameters: z.object({ value: z.string() }),
        handler: async ({ value }) => ({ success: true, data: value }),
      })
    );
    registry.register(
      createTool({
        name: 'echo',
        description: 'Echo v2',
        parameters: z.object({ value: z.string() }),
        handler: async ({ value }) => ({ success: true, data: value.toUpperCase() }),
      })
    );

    assert.equal(warnings.some((line) => line.includes('Overwriting existing tool: echo')), true);
    assert.equal(registry.getTool('echo')?.description, 'Echo v2');
  } finally {
    console.warn = originalWarn;
    restore();
  }
});

test('listTools returns serializable tool metadata', () => {
  const restore = muteConsole();
  try {
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'sum',
        description: 'Adds two numbers',
        parameters: z.object({ a: z.number(), b: z.number() }),
        handler: async ({ a, b }) => ({ success: true, data: a + b }),
      })
    );

    const tools = registry.listTools();

    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, 'sum');
    assert.equal(tools[0].description, 'Adds two numbers');
    assert.equal(typeof tools[0].parameters.safeParse, 'function');
  } finally {
    restore();
  }
});

test('execute validates parameters and returns INVALID_PARAMS on schema mismatch', async () => {
  const restore = muteConsole();
  try {
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'double',
        description: 'Doubles a number',
        parameters: z.object({ value: z.number() }),
        handler: async ({ value }) => ({ success: true, data: value * 2 }),
      })
    );

    const result = await registry.execute('double', { value: 'x' });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.code, 'INVALID_PARAMS');
      assert.equal(result.error.includes('Invalid parameters:'), true);
    }
  } finally {
    restore();
  }
});

test('execute returns TOOL_NOT_FOUND when tool is missing', async () => {
  const registry = new ToolRegistry();
  const result = await registry.execute('missing', {});

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.code, 'TOOL_NOT_FOUND');
    assert.equal(result.error, 'Tool not found: missing');
  }
});

test('execute runs handler on valid params and returns success payload', async () => {
  const restore = muteConsole();
  try {
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'double',
        description: 'Doubles a number',
        parameters: z.object({ value: z.number() }),
        handler: async ({ value }) => ({ success: true, data: value * 2 }),
      })
    );

    const result = await registry.execute<number>('double', { value: 21 });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data, 42);
    }
  } finally {
    restore();
  }
});

test('execute catches handler exceptions and returns EXECUTION_ERROR', async () => {
  const restore = muteConsole();
  try {
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'explode',
        description: 'Always fails',
        parameters: z.object({ value: z.string() }),
        handler: async () => {
          throw new Error('boom');
        },
      })
    );

    const result = await registry.execute('explode', { value: 'x' });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.code, 'EXECUTION_ERROR');
      assert.equal(result.error, 'boom');
    }
  } finally {
    restore();
  }
});

test('toAISDKTools returns a map of name -> description/parameters', () => {
  const restore = muteConsole();
  try {
    const registry = new ToolRegistry();
    const schema = z.object({ query: z.string() });
    registry.register(
      createTool({
        name: 'search',
        description: 'Searches documents',
        parameters: schema,
        handler: async ({ query }) => ({ success: true, data: query.length }),
      })
    );

    const tools = registry.toAISDKTools();

    assert.deepEqual(Object.keys(tools), ['search']);
    assert.equal(tools.search.description, 'Searches documents');
    assert.equal(tools.search.parameters, schema);
  } finally {
    restore();
  }
});

test('createTool returns the same definition object', () => {
  const definition = {
    name: 'identity',
    description: 'Returns same number',
    parameters: z.object({ value: z.number() }),
    handler: async ({ value }: { value: number }) => ({ success: true as const, data: value }),
  };

  const tool = createTool(definition);
  assert.equal(tool, definition);
});

