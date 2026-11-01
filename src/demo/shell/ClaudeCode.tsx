import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Window } from './kit/window';
import type { Box } from './layout';
import { SPINNER_FRAMES, spinnerVerb, type TranscriptEntry, type TranscriptState } from './transcript';
import '@fontsource/jetbrains-mono/400.css';

interface ClaudeCodeProps {
  box: Box;
  open: boolean;
  portrait: boolean;
  transcript: TranscriptState;
  /** Monospace size in px, from the stage's size. */
  fontSize: number;
}

const SPINNER_TICK_MS = 120;

/** The spinner's frame and the turn's elapsed seconds, ticking while Claude works. */
function useSpinner(busySince: number | null) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (busySince === null) return;
    setNow(performance.now());
    const id = window.setInterval(() => setNow(performance.now()), SPINNER_TICK_MS);
    return () => window.clearInterval(id);
  }, [busySince]);
  if (busySince === null) return null;
  const elapsed = Math.max(0, now - busySince);
  return { glyph: SPINNER_FRAMES[Math.floor(elapsed / SPINNER_TICK_MS) % SPINNER_FRAMES.length], seconds: Math.floor(elapsed / 1000) };
}

function Entry({ entry }: { entry: TranscriptEntry }) {
  if (entry.kind === 'user') {
    return (
      <div className="ds-cc__user">
        <span className="ds-cc__mark">&gt;</span>
        <span>{entry.text}</span>
      </div>
    );
  }
  if (entry.kind === 'text') {
    return (
      <div className="ds-cc__msg">
        <span className="ds-cc__bullet">⏺</span>
        <span>{entry.text}</span>
      </div>
    );
  }
  return (
    <div>
      <div className="ds-cc__msg">
        <span className="ds-cc__bullet" data-status={entry.status}>
          ⏺
        </span>
        <span>
          <b>{entry.title}</b>({entry.args})
        </span>
      </div>
      <div className="ds-cc__result" data-status={entry.status}>
        <span className="ds-cc__elbow">⎿</span>
        <span>{entry.summary ?? 'Running…'}</span>
      </div>
    </div>
  );
}

/**
 * A mock Claude Code session in a Mac Terminal window: the welcome box, the transcript, the spinner
 * while Claude works and the input box where the prompt is typed. Kept scrolled to the bottom.
 */
export function ClaudeCode({ box, open, portrait, transcript, fontSize }: ClaudeCodeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const spinner = useSpinner(transcript.busySince);
  const typing = transcript.typing;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  return (
    <Window
      chrome="terminal"
      lightsSize="large"
      title="maps — ✳ Claude Code"
      className="ds-term"
      data-open={open || undefined}
      data-portrait={portrait || undefined}
      aria-hidden={!open}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height, fontSize }}
    >
      <div className="ds-cc" ref={scrollRef}>
        <div className="ds-cc__welcome">
          <div>
            <span className="ds-cc__accent">✻</span> <b>Welcome to Claude Code!</b>
          </div>
          <div className="ds-cc__gap" />
          <div className="ds-cc__dim ds-cc__indent">/help for help, /status for your current setup</div>
          <div className="ds-cc__gap" />
          <div className="ds-cc__dim ds-cc__indent">cwd: /Users/mappo/maps</div>
        </div>

        {transcript.entries.map((entry, i) => (
          <Entry key={i} entry={entry} />
        ))}

        {spinner && (
          <div className="ds-cc__spinner">
            <span className="ds-cc__glyph">{spinner.glyph}</span>
            <span>{spinnerVerb(transcript.turn)}…</span>{' '}
            <span className="ds-cc__dim">({spinner.seconds}s · esc to interrupt)</span>
          </div>
        )}

        <div className="ds-cc__input">
          <span className="ds-cc__mark">&gt;</span>
          <span>
            {typing ? typing.text.slice(0, typing.shown) : ''}
            <span className="ds-cc__caret" data-still={(typing && typing.shown < typing.text.length) || undefined} />
          </span>
        </div>
        <div className="ds-cc__dim ds-cc__hint">? for shortcuts</div>
      </div>
    </Window>
  );
}
