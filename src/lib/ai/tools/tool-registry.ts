import { z } from 'zod';

// ============================================================================
// Tool Definition Types
// ============================================================================

/**
 * Result wrapper for tool executions with success/error states
 */
export type ToolResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

/**
 * Definition for a tool that can be called by the AI orchestrator
 */
export interface ToolDefinition<TParams extends z.ZodTypeAny, TResult> {
  name: string;
  description: string;
  parameters: TParams;
  handler: (params: z.infer<TParams>) => Promise<ToolResult<TResult>>;
}

/**
 * Serializable tool info for LLM context (without handler)
 */
export interface ToolInfo {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
}

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * Central registry for all AI-callable tools.
 * Handles registration, discovery, validation, and execution.
 */
export class ToolRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tools: Map<string, ToolDefinition<any, any>> = new Map();

  /**
   * Register a tool with the registry
   */
  register<TParams extends z.ZodTypeAny, TResult>(
    tool: ToolDefinition<TParams, TResult>
  ): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    console.log(`[ToolRegistry] Registered tool: ${tool.name}`);
  }

  /**
   * Get tool info for all registered tools (for LLM context)
   */
  listTools(): ToolInfo[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get a specific tool definition
   */
  getTool(name: string): ToolDefinition<z.ZodTypeAny, unknown> | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool by name with given parameters.
   * Validates parameters against the tool's schema before execution.
   */
  async execute<T = unknown>(
    name: string,
    params: unknown
  ): Promise<ToolResult<T>> {
    const tool = this.tools.get(name);
    
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
        code: 'TOOL_NOT_FOUND',
      };
    }

    // Validate parameters
    const parseResult = tool.parameters.safeParse(params);
    if (!parseResult.success) {
      return {
        success: false,
        error: `Invalid parameters: ${parseResult.error.message}`,
        code: 'INVALID_PARAMS',
      };
    }

    // Execute the tool
    try {
      console.log(`[Tool:${name}] Executing with params:`, params);
      const result = await tool.handler(parseResult.data);
      console.log(`[Tool:${name}] Result:`, result.success ? 'success' : result.error);
      return result as ToolResult<T>;
    } catch (error) {
      console.error(`[Tool:${name}] Execution error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'EXECUTION_ERROR',
      };
    }
  }

  /**
   * Convert tools to Vercel AI SDK format for function calling
   */
  toAISDKTools(): Record<string, { description: string; parameters: z.ZodTypeAny }> {
    const tools: Record<string, { description: string; parameters: z.ZodTypeAny }> = {};
    
    for (const [name, tool] of this.tools) {
      tools[name] = {
        description: tool.description,
        parameters: tool.parameters,
      };
    }
    
    return tools;
  }
}

// ============================================================================
// Helper to create type-safe tools
// ============================================================================

/**
 * Helper function to create a tool with proper typing
 */
export function createTool<TParams extends z.ZodTypeAny, TResult>(
  definition: ToolDefinition<TParams, TResult>
): ToolDefinition<TParams, TResult> {
  return definition;
}
