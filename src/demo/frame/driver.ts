import type { DemoRunState, FrameToShell, ShellToFrame } from '../protocol';
import {
  missingModels,
  parseDemoFile,
  relinkDemoModel,
  releaseHeldModels,
  showStartingState,
  type DemoFile,
} from './session';
import { projectAspect } from './startState';

/**
 * The frame's side of the demo: it answers the shell's messages (load, relink,
 * start, pause, reset...) and reports back. One per frame.
 */
export class DemoDriver {
  private demo: DemoFile | null = null;
  private state: DemoRunState = 'empty';

  constructor(private readonly post: (msg: FrameToShell) => void) {}

  get runState(): DemoRunState {
    return this.state;
  }

  get file(): DemoFile | null {
    return this.demo;
  }

  async handle(msg: ShellToFrame): Promise<void> {
    switch (msg.type) {
      case 'load':
        this.load(msg.fileName, msg.json);
        return;
      case 'relink-model':
        await this.relink(msg.modelId, msg.file);
        return;
      case 'reset':
        this.reset();
        return;
      default:
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

  /** Back to the empty starting state of the loaded file. */
  reset(): void {
    if (!this.demo) return;
    showStartingState(this.demo.project);
    this.setState('ready');
  }
}
