/**
 * AI Tools Barrel Export
 * 
 * Registers all available tools with the central registry.
 */

import { ToolRegistry } from './tool-registry';
import { searchLocalhostsTool } from './search-localhosts';
import { generateRouteTool } from './generate-route';
import { resolvePlaceTool } from './resolve-place';
import { checkAvailabilityTool } from './check-availability';
import { getWeatherTool } from './get-weather';

// Export types
export * from './tool-registry';

// Export individual tools for direct access
export { searchLocalhostsTool } from './search-localhosts';
export { generateRouteTool } from './generate-route';
export { resolvePlaceTool } from './resolve-place';
export { checkAvailabilityTool } from './check-availability';
export { getWeatherTool } from './get-weather';

/**
 * Create and configure the default tool registry with all travel planning tools.
 */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  
  // Register all tools
  registry.register(searchLocalhostsTool);
  registry.register(generateRouteTool);
  registry.register(resolvePlaceTool);
  registry.register(checkAvailabilityTool);
  registry.register(getWeatherTool);
  
  return registry;
}

// Singleton instance for convenience
let defaultRegistry: ToolRegistry | null = null;

export function getDefaultRegistry(): ToolRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createDefaultRegistry();
  }
  return defaultRegistry;
}
