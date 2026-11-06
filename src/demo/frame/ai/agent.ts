import type { DemoAiEvent, FrameToShell } from '../../protocol';
import { agentEvents, runAgentTool, type AgentEvent } from '@/agent';
import { commitAiWrite } from '@/agent/commit';
import { useProjectStore } from '@/store/useProjectStore';
import type { Project } from '@/store/types';
import type { DemoContext } from '../actions';
import { mockBoundarySearch, mockDirections, mockPlaceSearch } from '../mocks';
import { runPlay } from '../playRunner';
import { commitStep } from '../runners';
import { CREATED, type AiAction, type AiMock } from './script';

/**
 * Plays an AI script: the transcript events the mock Claude Code window shows,
 * and the real tool calls through `runAgentTool`, so the app's own AI feedback
 * (selecting what changed, pulsing the timeline and toolbar, following the map,
 * the status pill) reacts exactly as it does to a connected agent.
 */

/** Real Claude Code shows a tool as running for a moment before its result lands. */
const TOOL_LEAD_MS = 300;
const TOOL_TAIL_MS = 250;
/** Holds on a finished item so the app's pulse and map follow read before the next turn. */
const SETTLE_MS = 1300;

export function registerMocks(mocks: AiMock[] = []): void {
  for (const mock of mocks) {
    if (mock.kind === 'boundary') {
      mockBoundarySearch(mock.query, [{ displayName: mock.displayName, geometry: mock.geometry, countryCode: mock.countryCode }]);
    } else if (mock.kind === 'place') {
      mockPlaceSearch(mock.query, [{ name: mock.name, coordinates: mock.coordinates }]);
    } else {
      mockDirections({ start: mock.start, end: mock.end, geometry: mock.geometry });
    }
  }
}

/** A tool input with `CREATED` replaced by the id of what the last call made. */
function resolveInput(input: Record<string, unknown>, createdId: string | null): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value === CREATED && createdId ? createdId : value]));
}

const clip = (text: string, max = 96) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The id of the item or keyframe a tool result says it created. */
function createdIdOf(text: string | undefined): string | null {
  try {
    const parsed = JSON.parse(text ?? '') as { created?: { id?: unknown } };
    return typeof parsed.created?.id === 'string' ? parsed.created.id : null;
  } catch {
    return null;
  }
}

export interface AiAgentOptions {
  ctx: DemoContext;
  file: Project;
  post: (msg: FrameToShell) => void;
}

export class AiAgent {
  private readonly ctx: DemoContext;
  private readonly file: Project;
  private readonly post: (msg: FrameToShell) => void;
  private toolCalls = 0;
  /** The id the last call created, for the update and the swap that follow it. */
  private createdId: string | null = null;

  constructor({ ctx, file, post }: AiAgentOptions) {
    this.ctx = ctx;
    this.file = file;
    this.post = post;
  }

  event(event: DemoAiEvent): void {
    this.post({ type: 'ai-event', event });
  }

  async run(script: AiAction[], total: number): Promise<void> {
    for (const action of script) {
      this.ctx.clock.check();
      await this.perform(action, total);
    }
  }

  private async perform(action: AiAction, total: number): Promise<void> {
    const { clock } = this.ctx;
    switch (action.kind) {
      case 'progress':
        this.post({ type: 'progress', step: action.index + 1, total, label: action.label });
        return;
      case 'think':
        this.event({ kind: 'thinking', ms: action.ms });
        await clock.wait(action.ms);
        return;
      case 'text':
        this.event({ kind: 'text', text: action.text });
        await clock.wait(this.ctx.timing.betweenSteps * 0.5);
        return;
      case 'tool':
        await this.callTool(action.name, action.input, action.mocks);
        return;
      case 'commit': {
        // Let the app's reaction to the last call play out before its item is swapped for the file's.
        await clock.wait(SETTLE_MS);
        const { step } = action;
        const created = this.createdId;
        const replace = step.kind === 'item' && created && useProjectStore.getState().items[created] ? created : undefined;
        commitAiWrite(`AI: ${step.label}`, () => commitStep(step, this.file, { replace }));
        this.createdId = null;
        return;
      }
      case 'place':
        commitStep(action.step, action.file);
        await clock.wait(this.ctx.timing.betweenSteps * 0.5);
        return;
      case 'done':
        this.event({ kind: 'done' });
        await clock.wait(this.ctx.timing.betweenSteps);
        return;
      case 'play':
        await this.playBack();
        return;
      case 'finalize':
        for (const step of action.steps) commitAiWrite(`AI: ${step.label}`, () => commitStep(step, this.file));
        return;
    }
  }

  /** One tool call, shown as Claude Code shows it: running, then its one-line result. */
  private async callTool(name: string, rawInput: Record<string, unknown>, mocks?: AiMock[]): Promise<void> {
    const { clock } = this.ctx;
    const input = resolveInput(rawInput, this.createdId);
    registerMocks(mocks);
    const id = `toolu_${++this.toolCalls}`;
    this.event({ kind: 'tool-start', id, name, args: input });
    await clock.wait(TOOL_LEAD_MS);

    let outcome: AgentEvent | null = null;
    const unsubscribe = agentEvents.subscribe((e) => {
      if (e.tool === name && e.phase !== 'started') outcome = e;
    });
    const result = await runAgentTool(name, input).finally(unsubscribe);

    const text = result.content.find((c) => c.type === 'text')?.text;
    const made = result.isError ? null : createdIdOf(text);
    if (made) this.createdId = made;
    const done = outcome as AgentEvent | null;
    const summary = done?.summary ?? done?.error ?? clip(text ?? 'Done');
    await clock.wait(TOOL_TAIL_MS);
    this.event({ kind: 'tool-end', id, ok: !result.isError, summary: clip(summary) });
    await clock.wait(this.ctx.timing.betweenSteps * 0.4);
  }

  /**
   * The turn is over and the cursor is back: it plays the project as a person does, through zen mode.
   * No tool plays, so the transcript shows nothing for it.
   */
  private async playBack(): Promise<void> {
    const { cursor } = this.ctx;
    cursor.setHidden(false);
    await runPlay(this.ctx, { kind: 'play', label: 'Play' }, this.file);
    cursor.setHidden(true);
  }
}
