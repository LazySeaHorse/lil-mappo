import { DEMO_FRAME_PARAM } from '../protocol';

/** Placeholder: the stage, chrome, widget and mock Claude Code window land here. */
export default function DemoShell() {
  return <iframe title="li'l Mappo" src={`/?${DEMO_FRAME_PARAM}`} style={{ width: '100vw', height: '100vh', border: 0 }} />;
}
