import { useEffect, useReducer, useRef, useState } from 'react';
import { DEMO_FRAME_PARAM, onDemoMessage, type FrameToShell } from '../protocol';
import { AppDevice } from './AppDevice';
import { ClaudeCode } from './ClaudeCode';
import { DEFAULT_ASPECT, fitAspect, stageLayout } from './layout';
import { loadSettings } from './settings';
import { Stage } from './Stage';
import { INITIAL_TRANSCRIPT, transcriptReducer } from './transcript';
import { useViewportSize } from './useViewportSize';
import './shell.css';

const FRAME_SRC = `/?${DEMO_FRAME_PARAM}`;
/** Matches --ds-move in shell.css. */
const MOVE_MS = 650;

/** The demo's top-level page: the letterboxed stage, the app's iframe on it, and the controls. */
export default function DemoShell() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const view = useViewportSize();
  const [settings] = useState(loadSettings);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [aiOpen, setAiOpen] = useState(false);
  /** True while the windows glide to make room for the AI panel (or give it back). */
  const [moving, setMoving] = useState(false);
  const movingTimer = useRef<number>();
  const [transcript, dispatchTranscript] = useReducer(transcriptReducer, INITIAL_TRANSCRIPT);
  /** Live speed: the frame's `set-speed` and the typing both follow it mid-run. */
  const speedRef = useRef(settings.speed);
  const typeCharRef = useRef(settings.timing.typeChar);

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
        } else if (msg.type === 'ai-event') dispatchTranscript({ type: 'event', event: msg.event, now: performance.now() });
      }),
    [],
  );

  // Types the prompt one character every typeChar / speed ms (the frame waits the same), then sends it.
  const typing = transcript.typing;
  useEffect(() => {
    if (!typing) return;
    const perChar = typeCharRef.current / speedRef.current;
    const id = window.setTimeout(
      () => dispatchTranscript(typing.shown < typing.text.length ? { type: 'type-tick' } : { type: 'submit', now: performance.now() }),
      perChar,
    );
    return () => window.clearTimeout(id);
  }, [typing]);

  const box = fitAspect(view.width, view.height, aspect);
  const layout = stageLayout(box.width, box.height, aspect, aiOpen);
  const termFont = Math.max(11, Math.min(15, Math.round(Math.max(box.width, box.height) / 112)));

  return (
    <div className="ds-root" data-moving={moving || undefined}>
      <Stage box={box}>
        <ClaudeCode box={layout.terminal} open={aiOpen} portrait={layout.portrait} transcript={transcript} fontSize={termFont} />
        <AppDevice layout={layout} iframeRef={iframeRef} src={FRAME_SRC} />
        <div className="ds-shield" />
      </Stage>
    </div>
  );
}
