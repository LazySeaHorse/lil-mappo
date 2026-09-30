import { z } from 'zod/v4';
import { nanoid } from 'nanoid';
import { useProjectStore } from '@/store/useProjectStore';
import { agentEvents, type AgentEvent } from './events';
import { useAgentStore } from './store';
import { ToolError } from './errors';
import { isUserGestureActive } from './commit';
import type {
  AgentToolContent,
  AgentToolDescriptor,
  AgentToolResult,
  AnyAgentTool,
  ToolOutcome,
} from './defineTool';
import { ALL_TOOLS } from './tools';

const toolsByName = new Map<string, AnyAgentTool>(ALL_TOOLS.map((t) => [t.name, t]));

function errorResult(payload: Record<string, unknown>): AgentToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function toContent(outcome: ToolOutcome): AgentToolContent[] {
  const text = outcome.text ?? JSON.stringify(outcome.data ?? { ok: true });
  return [
    { type: 'text', text },
    ...(outcome.images ?? []).map((i) => ({ type: 'image' as const, data: i.data, mimeType: i.mimeType })),
  ];
}

function formatIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

// Write tools and render_frames touch shared state across awaits (fetches,
// playhead stepping); running them one at a time keeps each call coherent.
let exclusiveQueue: Promise<unknown> = Promise.resolve();
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = exclusiveQueue.then(fn, fn);
  exclusiveQueue = run.catch(() => undefined);
  return run;
}

/**
 * Runs one tool call: refusal checks, input validation, handler, event
 * emission. Resolves with an MCP-style result; never rejects.
 */
export async function runAgentTool(name: string, rawInput: unknown): Promise<AgentToolResult> {
  const id = nanoid(10);
  const emit = (phase: AgentEvent['phase'], extra: Partial<AgentEvent> = {}) =>
    agentEvents.emit({ id, tool: name, phase, input: rawInput, at: Date.now(), ...extra });

  emit('started');
  const fail = (payload: { error: string; message: string } & Record<string, unknown>) => {
    emit('failed', { error: payload.message });
    return errorResult(payload);
  };

  const tool = toolsByName.get(name);
  if (!tool) {
    return fail({
      error: 'unknown_tool',
      message: `Unknown tool "${name}".`,
      availableTools: [...toolsByName.keys()],
    });
  }

  if (!useAgentStore.getState().enabled) {
    return fail({
      error: 'agent_disabled',
      message: 'AI control is turned off in li\'l Mappo. Ask the user to enable it.',
    });
  }

  if (!tool.readOnly) {
    if (useProjectStore.getState().isExporting) {
      return fail({
        error: 'export_in_progress',
        message: 'A video export is running; the project cannot be changed until it finishes. Retry later.',
      });
    }
    if (isUserGestureActive()) {
      return fail({
        error: 'user_is_editing',
        message: 'The user is mid-drag in the editor. Retry in a moment.',
        retryable: true,
      });
    }
  }

  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const issues = formatIssues(parsed.error);
    return fail({
      error: 'invalid_input',
      message: `Invalid input for ${name}: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
      issues,
      hint: 'Call get_guide for conventions, or check the tool inputSchema.',
    });
  }

  try {
    const exec = () => Promise.resolve(tool.handler(parsed.data));
    const outcome = await (tool.exclusive ? runExclusive(exec) : exec());
    emit('succeeded', {
      summary: outcome.summary,
      affectedItemIds: outcome.affectedItemIds,
      affectedKeyframeIds: outcome.affectedKeyframeIds,
    });
    return { content: toContent(outcome) };
  } catch (err) {
    if (err instanceof ToolError) {
      return fail({ error: err.code, message: err.message, ...err.details });
    }
    console.error(`[agent] ${name} failed`, err);
    return fail({
      error: 'internal_error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Every exposed tool with a JSON Schema input, ready to register with WebMCP. */
export function getAgentTools(): AgentToolDescriptor[] {
  return ALL_TOOLS.map((tool) => {
    const schema = z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: schema,
      annotations: { title: tool.title, readOnlyHint: tool.readOnly, destructiveHint: tool.destructive },
      execute: (input: unknown) => runAgentTool(tool.name, input),
    };
  });
}
