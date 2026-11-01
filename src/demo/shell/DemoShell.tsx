import { useEffect, useRef, useState } from 'react';
import { DEMO_FRAME_PARAM, onDemoMessage, type FrameToShell } from '../protocol';
import { DEFAULT_ASPECT, fitAspect } from './layout';
import { Stage } from './Stage';
import { useViewportSize } from './useViewportSize';
import './shell.css';

/** The demo's top-level page: the letterboxed stage, the app's iframe on it, and the controls. */
export default function DemoShell() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const view = useViewportSize();
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);

  useEffect(
    () =>
      onDemoMessage<FrameToShell>((msg, source) => {
        if (source !== iframeRef.current?.contentWindow) return;
        if (msg.type === 'loaded') setAspect(msg.aspect);
      }),
    [],
  );

  const box = fitAspect(view.width, view.height, aspect);

  return (
    <div className="ds-root">
      <Stage box={box}>
        <iframe ref={iframeRef} title="li'l Mappo" src={`/?${DEMO_FRAME_PARAM}`} style={{ position: 'absolute', inset: '5%', width: '90%', height: '90%', border: 0 }} />
        <div className="ds-shield" />
      </Stage>
    </div>
  );
}
