import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DemoAiEvent } from '../protocol';
import { ClaudeCode } from './ClaudeCode';
import { INITIAL_TRANSCRIPT, transcriptReducer, type TranscriptState } from './transcript';

afterEach(cleanup);

const box = { left: 0, top: 0, width: 600, height: 400 };
const play = (events: Array<[DemoAiEvent, number]>): TranscriptState =>
  events.reduce((state, [event, now]) => transcriptReducer(state, { type: 'event', event, now }), INITIAL_TRANSCRIPT);
const show = (transcript: TranscriptState) =>
  render(<ClaudeCode box={box} open portrait={false} transcript={transcript} fontSize={12} />).container;

describe('ClaudeCode transcript', () => {
  it('shows the spinner with a word, the time and a token count while the agent works', () => {
    const view = show(play([[{ kind: 'thinking', ms: 1500 }, performance.now()]]));
    expect(view.querySelector('.ds-cc__spinner')?.textContent).toMatch(/^\S\s?[A-Z][a-z]+… \(0s · ↓ \d+ tokens · esc to interrupt\)$/);
    expect(view.textContent).toContain('✻Thinking…');
  });

  it('leaves the thought line, the worked footer and an idle input once the turn is done', () => {
    const view = show(
      play([
        [{ kind: 'thinking', ms: 2000 }, 0],
        [{ kind: 'text', text: 'Your map is ready.' }, 2000],
        [{ kind: 'done' }, 134_000],
      ]),
    );
    expect(view.textContent).toContain('∴Thought for 2s');
    expect(view.textContent).toContain('✻Worked for 2m 14s');
    expect(view.querySelector('.ds-cc__spinner')).toBeNull();
    expect(view.querySelector('.ds-cc__input .ds-cc__caret')).not.toBeNull();
  });
});
