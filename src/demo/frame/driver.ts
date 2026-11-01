import type { DemoRunSettings, DemoRunState, FrameToShell, ShellToFrame } from '../protocol';
import { dismissOpenLayers, type DemoContext } from './actions';
import { DemoClock, isDemoAborted } from './clock';
import { CursorController } from './cursor';
import { clearMocks } from './mocks';
import { planDemo } from './plan';
import { commitStep, runStep } from './runners';
import {
  missingModels,
  parseDemoFile,
  relinkDemoModel,
  releaseHeldModels,
  showStartingState,
  type DemoFile,
} from './session';
import { projectAspect } from './startState';
import { AiMode } from './ai/mode';

/**
 * The frame's side of the demo: it answers the shell's messages (load, relink,
 * start, pause, resume, speed, reset), runs the plan and reports back. One per
 * frame.
 */
export class DemoDriver {
  /** The cursor the run moves; `DemoFrame` draws it. Hidden until a run starts. */
  readonly cursor = new CursorController();
  private demo: DemoFile | null = null;
  private state: DemoRunState = 'empty';
  private clock: DemoClock | null = null;
  private run: Promise<void> | null = null;
  private readonly ai: AiMode;

  constructor(private readonly post: (msg: FrameToShell) => void) {
    this.cursor.setHidden(true);
    this.ai = new AiMode(post);
  }

  get runState(): DemoRunState {
    return this.state;
  }

  get file(): DemoFile | null {
    return this.demo;
  }

  /** Settles when the current run has stopped (finished, or unwound after a reset). */
  get finished(): Promise<void> {
    return this.run ?? Promise.resolve();
  }

  async handle(msg: ShellToFrame): Promise<void> {
    switch (msg.type) {
      case 'load':
        await this.stopRun();
        this.load(msg.fileName, msg.json);
        return;
      case 'relink-model':
        await this.relink(msg.modelId, msg.file);
        return;
      case 'start':
        await this.start(msg.settings);
        return;
      case 'pause':
        if (this.state !== 'running' || !this.clock) return;
        this.clock.pause();
        this.setState('paused');
        return;
      case 'resume':
        if (this.state !== 'paused' || !this.clock) return;
        this.clock.resume();
        this.setState('running');
        return;
      case 'set-speed':
        this.clock?.setSpeed(msg.speed);
        return;
      case 'reset':
        await this.reset();
        return;
    }
  }

  private setState(state: DemoRunState): void {
    if (this.state === state) return;
    this.state = state;
    this.post({ type: 'state', state });
  }

  private load(fileName: string, json: string): void {
    const parsed = parseDemoFile(json);
    if ('error' in parsed) {
      this.post({ type: 'load-error', message: parsed.error });
      return;
    }
    releaseHeldModels();
    this.demo = { fileName, project: parsed.project };
    showStartingState(parsed.project);
    this.post({
      type: 'loaded',
      title: parsed.project.name,
      aspect: projectAspect(parsed.project),
      missingModels: missingModels(parsed.project),
    });
    this.setState('ready');
  }

  private async relink(modelId: string, file: File): Promise<void> {
    const demo = this.demo;
    if (!demo) return;
    try {
      await relinkDemoModel(demo, modelId, file);
    } catch (error) {
      console.warn('[demo] could not relink model', modelId, error);
    }
    if (this.demo === demo) this.post({ type: 'models', missingModels: missingModels(demo.project) });
  }

  /** Starts a run from the starting state (a finished run is reset first). */
  private async start(settings: DemoRunSettings): Promise<void> {
    if (!this.demo || this.state === 'running' || this.state === 'paused') return;
    if (this.state === 'done') await this.reset();
    const file = this.demo.project;
    const clock = new DemoClock({ speed: settings.speed });
    this.clock = clock;
    const ctx: DemoContext = { clock, cursor: this.cursor, timing: settings.timing };
    this.cursor.setHidden(false);
    if (this.cursor.position.x === 0 && this.cursor.position.y === 0) {
      this.cursor.jumpTo({ x: window.innerWidth * 0.62, y: window.innerHeight * 0.58 });
    }
    this.setState('running');
    this.run = settings.mockAi ? this.runAi(ctx, file, settings) : this.runPlan(ctx, file);
    await this.run;
  }

  /** Mock AI mode: the cursor flicks AI on, then a scripted agent builds the project; no cursor after that. */
  private async runAi(ctx: DemoContext, file: DemoFile['project'], settings: DemoRunSettings): Promise<void> {
    try {
      await this.ai.run(ctx, file, settings);
      if (this.clock === ctx.clock) this.setState('done');
    } catch (error) {
      if (!isDemoAborted(error)) throw error;
    }
  }

  private async runPlan(ctx: DemoContext, file: DemoFile['project']): Promise<void> {
    const steps = planDemo(file);
    try {
      for (const [i, step] of steps.entries()) {
        ctx.clock.check();
        this.post({ type: 'progress', step: i + 1, total: steps.length, label: step.label });
        try {
          await runStep(ctx, step, file);
        } catch (error) {
          if (isDemoAborted(error)) throw error;
          // A broken flow must not stop the run: its result is still written.
          console.error('[demo] step failed:', step.label, error);
          commitStep(step, file);
        }
        await ctx.clock.wait(ctx.timing.betweenSteps);
      }
      if (this.clock === ctx.clock) this.setState('done');
    } catch (error) {
      if (!isDemoAborted(error)) throw error;
    }
  }

  /** Cancels a run in progress and waits for it to unwind. */
  private async stopRun(): Promise<void> {
    this.clock?.cancel();
    this.clock = null;
    await this.run?.catch(() => {});
    this.run = null;
    this.ai.teardown();
  }

  /** Back to the empty starting state of the loaded file, stopping a run in progress. */
  async reset(): Promise<void> {
    await this.stopRun();
    if (!this.demo) return;
    clearMocks();
    this.cursor.setHidden(true);
    dismissOpenLayers();
    showStartingState(this.demo.project);
    this.setState('ready');
  }
}
