import { useEffect } from 'react';
import { postDemoMessage } from '../protocol';

/** Placeholder: mounted beside the editor in the frame; owns the driver, cursor and input blocker. */
export default function DemoFrame() {
  useEffect(() => {
    if (window.parent !== window) postDemoMessage(window.parent, { type: 'frame-ready' });
  }, []);
  return null;
}
