import type { AppDispatch } from '@/store/store';
import { toolCallReceived, type ToolCallSource } from '@/store/tool-calls-slice';

type ToolInvocationLike = {
  toolName?: string;
  state?: string;
  args?: unknown;
  input?: unknown;
  parameters?: unknown;
  result?: unknown;
};

type ToolCallState = 'call' | 'result' | 'error' | 'unknown';

type OrchestratorToolCall = {
  tool: string;
  params?: unknown;
  success?: boolean;
  result?: unknown;
};

type ToolPartLike = {
  type?: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  preliminary?: boolean;
  errorText?: string;
  rawInput?: unknown;
};

function getParams(tool: ToolInvocationLike) {
  if ('args' in tool) return tool.args;
  if ('input' in tool) return tool.input;
  if ('parameters' in tool) return tool.parameters;
  return undefined;
}

function normalizeState(tool: ToolInvocationLike): ToolCallState {
  if (typeof tool.state === 'string') {
    if (tool.state === 'call' || tool.state === 'result' || tool.state === 'error') {
      return tool.state;
    }
    return 'unknown';
  }
  return tool.result ? 'result' : 'call';
}

function isToolPart(part: ToolPartLike) {
  if (!part.type) return false;
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

function getToolNameFromPart(part: ToolPartLike) {
  if (typeof part.toolName === 'string' && part.toolName.length > 0) {
    return part.toolName;
  }
  if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
    return part.type.slice(5);
  }
  return null;
}

function normalizeToolPartState(state?: string): ToolCallState {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
    case 'approval-requested':
    case 'approval-responded':
      return 'call';
    case 'output-available':
      return 'result';
    case 'output-error':
    case 'output-denied':
      return 'error';
    default:
      return 'unknown';
  }
}

function getToolPartResult(part: ToolPartLike) {
  if (part.state === 'output-available') {
    return part.output;
  }
  if (part.state === 'output-error') {
    return {
      errorText: part.errorText,
      rawInput: part.rawInput,
    };
  }
  if (part.state === 'output-denied') {
    return {
      errorText: 'output-denied',
    };
  }
  return undefined;
}

export function ingestToolInvocations(
  dispatch: AppDispatch,
  toolInvocations: ToolInvocationLike[] | undefined,
  source: ToolCallSource
) {
  if (!Array.isArray(toolInvocations)) {
    console.log('[ToolEvents] No tool invocations to process');
    return;
  }

  console.log('[ToolEvents] Ingesting', toolInvocations.length, 'tool invocations from', source);

  for (const tool of toolInvocations) {
    if (!tool.toolName) continue;

    const normalizedState = normalizeState(tool);
    console.log('[ToolEvents] Dispatching tool:', {
      toolName: tool.toolName,
      state: normalizedState,
      hasResult: !!tool.result,
      result: tool.result,
    });

    dispatch(
      toolCallReceived({
        toolName: tool.toolName,
        state: normalizedState,
        params: getParams(tool),
        result: tool.result,
        source,
      })
    );
  }
}

export function ingestOrchestratorToolCalls(
  dispatch: AppDispatch,
  toolCalls: OrchestratorToolCall[] | undefined,
  source: ToolCallSource
) {
  if (!Array.isArray(toolCalls)) return;

  for (const call of toolCalls) {
    dispatch(
      toolCallReceived({
        toolName: call.tool,
        state: 'call',
        params: call.params,
        source,
      })
    );
    if (call.result) {
      dispatch(
        toolCallReceived({
          toolName: call.tool,
          state: 'result',
          params: call.params,
          result: call.result,
          success: call.success,
          source,
        })
      );
    }
  }
}

export function ingestToolParts(
  dispatch: AppDispatch,
  parts: ToolPartLike[] | undefined,
  source: ToolCallSource,
  seen?: Set<string>
) {
  if (!Array.isArray(parts)) return;

  console.log('[ingestToolParts] Processing parts:', parts);

  for (const part of parts) {
    if (!isToolPart(part)) continue;
    
    const toolName = getToolNameFromPart(part);
    if (!toolName) continue;

    // Generate a fallback ID if toolCallId is missing
    const toolCallId = part.toolCallId || `${toolName}-${Date.now()}`;

    const state = normalizeToolPartState(part.state);
    const keySuffix =
      state === 'result' ? `${part.preliminary ? 'preliminary' : 'final'}` : state;
    const key = `${toolCallId}:${keySuffix}`;
    
    if (seen) {
      if (seen.has(key)) continue;
      seen.add(key);
    }

    console.log(`[ingestToolParts] Dispatching tool:`, {
      toolName,
      state,
      params: part.input,
      result: getToolPartResult(part),
    });

    dispatch(
      toolCallReceived({
        toolName,
        state,
        params: part.input,
        result: getToolPartResult(part),
        source,
      })
    );
  }
}

export function recordToolResult(
  dispatch: AppDispatch,
  payload: {
    toolName: string;
    result: unknown;
    source: ToolCallSource;
    params?: unknown;
  }
) {
  dispatch(
    toolCallReceived({
      toolName: payload.toolName,
      state: 'result',
      params: payload.params,
      result: payload.result,
      source: payload.source,
    })
  );
}
