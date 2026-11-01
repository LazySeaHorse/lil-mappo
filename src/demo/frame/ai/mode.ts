import type { DemoRunSettings, FrameToShell } from '../../protocol';
import { agentEvents, useAgentStore } from '@/agent';
import { isModelReady } from '@/models/modelRegistry';
import { useAiPanelStore } from '@/components/AI/useAiPanelStore';
import type { Project } from '@/store/types';
import { click, type DemoContext, type Locator } from '../actions';
import { planDemo } from '../plan';
import { AiAgent } from './agent';
import { buildAiScript } from './script';

/**
 * Mock AI mode: the cursor switches AI control on in the real panel, the
 * (mock) Claude Code window opens and is told what to build, and a scripted
 * agent builds the project through the app's own tool layer. Nothing else
 * drives the app.
 */

const AI_BUTTON: Locator = { walkthrough: 'ai', description: 'the AI button' };
const AI_SWITCH: Locator = { role: 'switch', name: 'Allow AI agents to control this project', description: 'the AI control switch' };

/** The shell slides the terminal in and narrows the app window this long. */
const PANEL_SLIDE_MS = 800;
/** The bridge reads as dialling for a moment before it reads as connected. */
const CONNECTING_MS = 700;
const READ_PANEL_MS = 1100;

export class AiMode {
  private active = false;

  constructor(private readonly post: (msg: FrameToShell) => void) {}

  /** The whole mock AI run. Rejects with DemoAborted when the run is reset. */
  async run(ctx: DemoContext, file: Project, settings: DemoRunSettings): Promise<void> {
    this.active = true;
    agentEvents.clear();
    // Custom map styles are a paid feature; the demo's account is paid.
    useAgentStore.getState().setPaidPlan(true);
    await this.switchOn(ctx);

    this.post({ type: 'ai-panel', open: true });
    await ctx.clock.wait(PANEL_SLIDE_MS);

    const prompt = settings.aiPrompt.trim() || `Build "${file.name}" on the map.`;
    const agent = new AiAgent({ ctx, file, post: this.post });
    agent.event({ kind: 'user', text: prompt });
    // The shell types it at typeChar / speed per character, then sends it.
    await ctx.clock.wait((prompt.length + 1) * ctx.timing.typeChar);

    const steps = planDemo(file);
    const script = buildAiScript(file, steps, { modelReady: (assetId) => isModelReady(file.models[assetId]) });
    await agent.run(script, steps.length);
  }

  /**
   * The cursor opens the AI panel, switches AI control on and, once the (faked)
   * bridge reads as connected, closes the panel again: the map gets the room,
   * and the status pill ("AI connected, N calls") keeps showing the link.
   */
  private async switchOn(ctx: DemoContext): Promise<void> {
    const panel = useAiPanelStore.getState();
    if (!panel.open) await click(ctx, AI_BUTTON);
    const flick = await click(ctx, AI_SWITCH);
    if (!flick || !useAgentStore.getState().enabled) {
      console.warn('[demo] could not switch AI control on through the panel: switched on directly');
      useAgentStore.getState().setEnabled(true);
    }
    // The real bridge is not dialled in the demo frame.
    useAiPanelStore.getState().setBridgeStatus('connecting');
    await ctx.clock.wait(CONNECTING_MS);
    useAiPanelStore.getState().setBridgeStatus('connected');
    await ctx.clock.wait(READ_PANEL_MS);
    if (useAiPanelStore.getState().open) await click(ctx, AI_BUTTON);
    ctx.cursor.setHidden(true);
  }

  /** Back to AI control off, the panel closed and the Claude Code window away. */
  teardown(): void {
    if (!this.active) return;
    this.active = false;
    useAgentStore.getState().setEnabled(false);
    useAiPanelStore.getState().closePanel();
    useAiPanelStore.getState().setBridgeStatus('off');
    agentEvents.clear();
    this.post({ type: 'ai-panel', open: false });
  }
}
