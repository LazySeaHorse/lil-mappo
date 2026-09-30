import type { AgentToolDescriptor } from './defineTool';

/**
 * Minimal WebMCP adapter (native browser API only, no extension or polyfill).
 *
 * The API moved from `navigator.modelContext` (Chrome <= 149, deprecated in
 * 150) to `document.modelContext`. We feature-detect both, preferring the
 * current one. Registration returns an unregister function; tools that are
 * not registered do not exist for the agent.
 *
 * We do not use the `use-webmcp-tool` hook: it only looks at
 * `document.modelContext` (so it would silently do nothing on Chrome <= 149),
 * has no `title`, and is one hook per tool, which cannot register a list that
 * comes from `getAgentTools()` without a component per tool.
 */

interface ModelContextLike {
  registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown;
  unregisterTool?: (name: string) => void;
}

function getModelContext(): ModelContextLike | null {
  if (typeof document !== 'undefined') {
    const ctx = (document as unknown as { modelContext?: ModelContextLike }).modelContext;
    if (ctx && typeof ctx.registerTool === 'function') return ctx;
  }
  if (typeof navigator !== 'undefined') {
    const ctx = (navigator as unknown as { modelContext?: ModelContextLike }).modelContext;
    if (ctx && typeof ctx.registerTool === 'function') return ctx;
  }
  return null;
}

/** True when this browser exposes native WebMCP (document.modelContext or navigator.modelContext). */
export function isWebMcpSupported(): boolean {
  return getModelContext() !== null;
}

/**
 * Registers one tool. Returns an unregister function (idempotent), or null if
 * WebMCP is unsupported or registration was refused (e.g. permissions policy).
 */
export function registerWebMcpTool(tool: AgentToolDescriptor): (() => void) | null {
  const ctx = getModelContext();
  if (!ctx) return null;
  const controller = new AbortController();
  let handle: unknown;
  try {
    handle = ctx.registerTool(
      {
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.annotations.readOnlyHint,
          destructiveHint: tool.annotations.destructiveHint,
        },
        execute: (input: unknown) => tool.execute(input),
      },
      { signal: controller.signal },
    );
  } catch (err) {
    console.warn(`[webmcp] could not register ${tool.name}`, err);
    return null;
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    // Current API: aborting the signal unregisters. Older builds ignore the
    // signal and use unregisterTool(name) or a returned handle instead.
    controller.abort();
    try {
      const h = handle as { unregister?: () => void } | undefined;
      if (h && typeof h.unregister === 'function') h.unregister();
      else if (typeof ctx.unregisterTool === 'function') ctx.unregisterTool(tool.name);
    } catch {
      // Already unregistered by the abort above.
    }
  };
}
