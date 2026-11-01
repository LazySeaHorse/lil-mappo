import { useEffect, useState } from 'react';
import { onDemoMessage, postDemoMessage, type FrameToShell, type ShellToFrame } from '../protocol';
import { getAgentMap } from '@/agent/mapRef';
import { installPointerCapturePatch } from './actions';
import { DemoCursor } from './DemoCursor';
import { DemoDriver } from './driver';
import { installFetchMocks } from './mocks';

/** How long the frame waits for the editor's map before saying it is ready anyway. */
const EDITOR_WAIT_MS = 20_000;

/**
 * Mounted beside the editor in the frame. Owns the demo driver (load, run,
 * reset), draws its cursor, and installs the frame's fetch mocks and pointer
 * capture patch; the input blocker is set up separately (`setup.ts`).
 */
export default function DemoFrame() {
  const [driver] = useState(() => new DemoDriver(postToShell));

  useEffect(() => {
    const uninstallMocks = installFetchMocks();
    const restoreCapture = installPointerCapturePatch();
    return () => {
      uninstallMocks();
      restoreCapture();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onDemoMessage<ShellToFrame>((msg, source) => {
      if (source !== window.parent) return;
      void driver.handle(msg);
    });
    // The editor mounts its map once the working draft has loaded; a project loaded before
    // that would be replaced by the draft, so the shell hears "ready" only then.
    let waited = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const announce = () => {
      if (getAgentMap() || waited >= EDITOR_WAIT_MS) {
        postToShell({ type: 'frame-ready' });
        return;
      }
      waited += 100;
      timer = setTimeout(announce, 100);
    };
    announce();
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [driver]);

  return <DemoCursor controller={driver.cursor} />;
}

function postToShell(msg: FrameToShell): void {
  if (window.parent !== window) postDemoMessage(window.parent, msg);
}
