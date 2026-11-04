import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  DEMO_FRAME_PARAM,
  onDemoMessage,
  postDemoMessage,
  type DemoMissingModel,
  type DemoRunState,
  type FrameToShell,
  type ShellToFrame,
} from '../protocol';
import { AppDevice } from './AppDevice';
import { ClaudeCode } from './ClaudeCode';
import { Countdown } from './Countdown';
import { DEFAULT_ASPECT, appViewportBox, fitAspect, frameToStage, stageLayout } from './layout';
import { loadSettings, sanitizeSettings, saveSettings } from './settings';
import { Stage } from './Stage';
import { INITIAL_TRANSCRIPT, transcriptReducer } from './transcript';
import { useViewportSize } from './useViewportSize';
import {
  INITIAL_DIRECTOR,
  cameraView,
  directFocus,
  directIdle,
  idleDelay,
  viewStyle,
  type DirectorState,
  type ZoomSpace,
} from './zoom';
import { Widget, type LoadStatus, type Progress } from './Widget';
import './shell.css';

const FRAME_SRC = `/?${DEMO_FRAME_PARAM}`;
/** Matches --ds-move in shell.css. */
const MOVE_MS = 650;
const COUNTDOWN_FROM = 3;
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const SHORTCUT = IS_MAC ? '⌘.' : 'Ctrl+.';

function isProjectFile(file: File): boolean {
  return /\.(lilmap|json)$/i.test(file.name);
}

/** The demo's top-level page: the letterboxed stage, the app's iframe on it, and the controls. */
export default function DemoShell() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const view = useViewportSize();
  const [settings, setSettings] = useState(loadSettings);
  const [frameReady, setFrameReady] = useState(false);
  const [load, setLoad] = useState<LoadStatus>({ kind: 'none' });
  const [missingModels, setMissingModels] = useState<DemoMissingModel[]>([]);
  const [runState, setRunState] = useState<DemoRunState>('empty');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(true);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [aiOpen, setAiOpen] = useState(false);
  /** True while the windows glide to make room for the AI panel (or give it back). */
  const [moving, setMoving] = useState(false);
  const movingTimer = useRef<number>();
  const [transcript, dispatchTranscript] = useReducer(transcriptReducer, INITIAL_TRANSCRIPT);

  // Commands wait in line until the frame says it is ready.
  const readyRef = useRef(false);
  const queue = useRef<ShellToFrame[]>([]);
  const send = useCallback((msg: ShellToFrame) => {
    const target = iframeRef.current?.contentWindow;
    if (readyRef.current && target) postDemoMessage(target, msg);
    else queue.current.push(msg);
  }, []);

  /** The auto zoom camera. `instant` snaps it (a reset) instead of easing. */
  const [camera, setCamera] = useState<{ director: DirectorState; instant: boolean }>({ director: INITIAL_DIRECTOR, instant: false });

  const box = fitAspect(view.width, view.height, aspect);
  const layout = stageLayout(box.width, box.height, aspect, aiOpen);
  const zoomSpace: ZoomSpace = { stage: { width: box.width, height: box.height }, viewport: appViewportBox(layout), maxZoom: settings.maxZoom };

  /** Live values the message handler and typing read without re-subscribing. */
  const live = useRef({ settings, runState, layout, zoomSpace });
  live.current = { settings, runState, layout, zoomSpace };

  useEffect(
    () =>
      onDemoMessage<FrameToShell>((msg, source) => {
        const frame = iframeRef.current?.contentWindow;
        if (!frame || source !== frame) return;
        // By string, so a message newer than this protocol.ts (toggle-widget) is still understood.
        if ((msg as { type: string }).type === 'toggle-widget') {
          setWidgetOpen((open) => !open);
          return;
        }
        switch (msg.type) {
          case 'frame-ready': {
            readyRef.current = true;
            setFrameReady(true);
            const pending = queue.current.splice(0);
            for (const m of pending) postDemoMessage(frame, m);
            break;
          }
          case 'loaded':
            setAspect(msg.aspect);
            setMissingModels(msg.missingModels);
            setLoad((prev) => ({ kind: 'loaded', fileName: 'fileName' in prev ? prev.fileName : '', title: msg.title }));
            setProgress(null);
            dispatchTranscript({ type: 'clear' });
            break;
          case 'load-error':
            setLoad((prev) => ({ kind: 'error', fileName: 'fileName' in prev ? prev.fileName : '', message: msg.message }));
            break;
          case 'models':
            setMissingModels(msg.missingModels);
            break;
          case 'state':
            setRunState(msg.state);
            break;
          case 'progress':
            setProgress({ step: msg.step, total: msg.total, label: msg.label });
            break;
          case 'ai-panel':
            setAiOpen(msg.open);
            setMoving(true);
            window.clearTimeout(movingTimer.current);
            movingTimer.current = window.setTimeout(() => setMoving(false), MOVE_MS + 100);
            break;
          case 'ai-event':
            dispatchTranscript({ type: 'event', event: msg.event, now: performance.now() });
            break;
          case 'focus': {
            // Mock AI mode has its own camera (the terminal while typing), so the frame's focus is not used there.
            const { settings: s, layout: l, zoomSpace: space } = live.current;
            if (!s.autoZoom || s.mockAi) break;
            const region = msg.rect ? frameToStage(l, msg.rect) : null;
            setCamera((c) => ({ director: directFocus(c.director, { region, intent: msg.intent }, performance.now(), space), instant: false }));
            break;
          }
        }
      }),
    [],
  );

  // Types the prompt one character every typeChar / speed ms (the frame waits the same), then sends it.
  const typing = transcript.typing;
  useEffect(() => {
    if (!typing) return;
    const { timing, speed } = live.current.settings;
    const id = window.setTimeout(
      () => dispatchTranscript(typing.shown < typing.text.length ? { type: 'type-tick' } : { type: 'submit', now: performance.now() }),
      timing.typeChar / speed,
    );
    return () => window.clearTimeout(id);
  }, [typing]);

  useEffect(() => saveSettings(settings), [settings]);

  // Turning auto zoom (or mock AI mode) on or off starts the camera from the whole stage; it eases there.
  const { autoZoom, mockAi } = settings;
  useEffect(() => setCamera({ director: INITIAL_DIRECTOR, instant: false }), [autoZoom, mockAi]);

  // No focus for a while: the camera eases back out. A paused run holds its zoom.
  useEffect(() => {
    if (runState !== 'running') return;
    const delay = idleDelay(camera.director, performance.now());
    if (delay === null) return;
    const id = window.setTimeout(
      () => setCamera((c) => ({ director: directIdle(c.director, performance.now() + 5), instant: false })),
      delay,
    );
    return () => window.clearTimeout(id);
  }, [camera.director, runState]);

  // A snap lasts one render.
  useEffect(() => {
    if (!camera.instant) return;
    const id = window.setTimeout(() => setCamera((c) => (c.instant ? { ...c, instant: false } : c)), 60);
    return () => window.clearTimeout(id);
  }, [camera.instant]);

  // Speed follows the slider live during a run.
  const speed = settings.speed;
  useEffect(() => {
    const state = live.current.runState;
    if (state === 'running' || state === 'paused') send({ type: 'set-speed', speed });
  }, [speed, send]);

  // Cmd/Ctrl + Period shows and hides the widget.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '.' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setWidgetOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      if (!isProjectFile(file)) {
        setLoad({ kind: 'error', fileName: file.name, message: `${file.name} is not a .lilmap or .json save` });
        return;
      }
      setLoad({ kind: 'loading', fileName: file.name });
      try {
        send({ type: 'load', fileName: file.name, json: await file.text() });
      } catch {
        setLoad({ kind: 'error', fileName: file.name, message: `Could not read ${file.name}` });
      }
    },
    [send],
  );

  // A save file dropped anywhere on the page loads it.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && (live.current.runState === 'empty' || live.current.runState === 'ready')) void openFile(file);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [openFile]);

  // 3-2-1, then the run starts with the settings as they are at "go".
  useEffect(() => {
    if (count === null) return;
    const id = window.setTimeout(() => {
      if (count > 1) {
        setCount(count - 1);
        return;
      }
      setCount(null);
      dispatchTranscript({ type: 'clear' });
      setProgress(null);
      send({ type: 'start', settings: sanitizeSettings(live.current.settings) });
    }, 1000);
    return () => window.clearTimeout(id);
  }, [count, send]);

  const reset = () => {
    setCamera({ director: INITIAL_DIRECTOR, instant: true });
    dispatchTranscript({ type: 'clear' });
    setProgress(null);
    send({ type: 'reset' });
  };

  // Mock AI mode: the terminal while the prompt is typed, then the whole stage for the rest of the run.
  const aiTyping = settings.mockAi && aiOpen && transcript.typing !== null;
  const zoomView = cameraView({ ...settings, aiTyping, director: camera.director, terminal: layout.terminal, space: zoomSpace });
  const termFont = Math.max(11, Math.min(15, Math.round(Math.max(box.width, box.height) / 112)));

  return (
    <div className="ds-root" data-moving={moving || undefined}>
      <Stage
        box={box}
        zoom={viewStyle(zoomView, { speed: settings.speed, instant: camera.instant })}
        overlay={
          <>
            <div className="ds-shield" />
            <Countdown count={count} />
          </>
        }
      >
        <ClaudeCode box={layout.terminal} open={aiOpen} portrait={layout.portrait} transcript={transcript} fontSize={termFont} />
        <AppDevice layout={layout} iframeRef={iframeRef} src={FRAME_SRC} />
      </Stage>
      {widgetOpen && (
        <Widget
          frameReady={frameReady}
          load={load}
          missingModels={missingModels}
          settings={settings}
          runState={runState}
          progress={progress}
          countingDown={count !== null}
          shortcut={SHORTCUT}
          onOpenFile={(file) => void openFile(file)}
          onRelink={(modelId, file) => send({ type: 'relink-model', modelId, file })}
          onSettings={setSettings}
          onStart={() => setCount(COUNTDOWN_FROM)}
          onPause={() => send({ type: 'pause' })}
          onResume={() => send({ type: 'resume' })}
          onReset={reset}
          onClose={() => setWidgetOpen(false)}
        />
      )}
    </div>
  );
}
