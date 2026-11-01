import { useEffect, useRef, useState } from 'react';
import { DEMO_FRAME_PARAM, onDemoMessage, type FrameToShell } from '../protocol';
import { AppDevice } from './AppDevice';
import { DEFAULT_ASPECT, fitAspect, stageLayout } from './layout';
import { Stage } from './Stage';
import { useViewportSize } from './useViewportSize';
import './shell.css';

const FRAME_SRC = `/?${DEMO_FRAME_PARAM}`;
/** Matches --ds-move in shell.css. */
const MOVE_MS = 650;

/** The demo's top-level page: the letterboxed stage, the app's iframe on it, and the controls. */
export default function DemoShell() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const view = useViewportSize();
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [aiOpen, setAiOpen] = useState(false);
  /** True while the windows glide to make room for the AI panel (or give it back). */
  const [moving, setMoving] = useState(false);
  const movingTimer = useRef<number>();

  useEffect(
    () =>
      onDemoMessage<FrameToShell>((msg, source) => {
        if (source !== iframeRef.current?.contentWindow) return;
        if (msg.type === 'loaded') setAspect(msg.aspect);
        else if (msg.type === 'ai-panel') {
          setAiOpen(msg.open);
          setMoving(true);
          window.clearTimeout(movingTimer.current);
          movingTimer.current = window.setTimeout(() => setMoving(false), MOVE_MS + 100);
        }
      }),
    [],
  );

  const box = fitAspect(view.width, view.height, aspect);
  const layout = stageLayout(box.width, box.height, aspect, aiOpen);

  return (
    <div className="ds-root" data-moving={moving || undefined}>
      <Stage box={box}>
        <AppDevice layout={layout} iframeRef={iframeRef} src={FRAME_SRC} />
        <div className="ds-shield" />
      </Stage>
    </div>
  );
}
