import { describe, expect, it } from 'vitest';
import type { DemoAiEvent } from '../protocol';
import {
  INITIAL_TRANSCRIPT,
  SPINNER_VERBS,
  THOUGHT_MIN_MS,
  formatSeconds,
  formatTokens,
  formatToolArgs,
  formatToolTitle,
  spinnerTokens,
  spinnerVerb,
  transcriptReducer,
  type TranscriptState,
} from './transcript';

const ev = (state: TranscriptState, event: DemoAiEvent, now = 0) => transcriptReducer(state, { type: 'event', event, now });

describe('formatToolTitle', () => {
  it('titles tools the way Claude Code titles MCP tools', () => {
    expect(formatToolTitle('add_boundary')).toBe('lilmappo - add_boundary (MCP)');
    expect(formatToolTitle('mcp__lilmappo__add_route')).toBe('lilmappo - add_route (MCP)');
  });
});

describe('formatToolArgs', () => {
  it('prints args compactly, strings quoted', () => {
    expect(formatToolArgs({ name: 'France', fill: true, opacity: 0.4 })).toBe('name: "France", fill: true, opacity: 0.4');
  });

  it('collapses long nested values and truncates the line', () => {
    expect(formatToolArgs({ coords: [[2.35, 48.85], [4.83, 45.76], [7.26, 43.7]] })).toBe('coords: […]');
    expect(formatToolArgs({ style: { color: '#e11d48', width: 4, dash: [2, 2] } })).toBe('style: {…}');
    const long = formatToolArgs({ a: 'x'.repeat(20), b: 'y'.repeat(20), c: 'z'.repeat(20), d: 'w'.repeat(20) });
    expect(long.length).toBeLessThanOrEqual(75);
    expect(long.endsWith(', …')).toBe(true);
  });

  it('shortens long strings with an ellipsis', () => {
    expect(formatToolArgs({ text: 'a'.repeat(40) })).toBe(`text: "${'a'.repeat(27)}…"`);
  });

  it('prints nothing for no args', () => {
    expect(formatToolArgs(undefined)).toBe('');
    expect(formatToolArgs({})).toBe('');
  });
});

describe('transcriptReducer', () => {
  it('types a user prompt into the input, then sends it into the transcript and starts the spinner', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'user', text: 'Hi' });
    expect(s.typing).toEqual({ text: 'Hi', shown: 0 });
    s = transcriptReducer(s, { type: 'type-tick' });
    s = transcriptReducer(s, { type: 'type-tick' });
    s = transcriptReducer(s, { type: 'type-tick' });
    expect(s.typing).toEqual({ text: 'Hi', shown: 2 });
    s = transcriptReducer(s, { type: 'submit', now: 1000 });
    expect(s.typing).toBeNull();
    expect(s.entries).toEqual([{ kind: 'user', text: 'Hi' }]);
    expect(s.busySince).toBe(1000);
  });

  it('sends a half-typed prompt whole before the next event lands', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'user', text: 'Map France' });
    s = ev(s, { kind: 'text', text: 'On it.' }, 50);
    expect(s.entries).toEqual([
      { kind: 'user', text: 'Map France' },
      { kind: 'text', text: 'On it.' },
    ]);
    expect(s.typing).toBeNull();
  });

  it('keeps the spinner start through thinking and tool calls, and stops it on done', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'thinking', ms: 1200 }, 10);
    expect(s.busySince).toBe(10);
    s = ev(s, { kind: 'tool-start', id: 't1', name: 'add_boundary', args: { name: 'France' } }, 900);
    expect(s.busySince).toBe(10);
    s = ev(s, { kind: 'done' }, 2000);
    expect(s.busySince).toBeNull();
  });

  it('keeps the spinner off for anything that lands after done, until the next prompt is sent', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'tool-start', id: 't1', name: 'set_playhead', args: { time: 0 } }, 10);
    s = ev(s, { kind: 'tool-end', id: 't1', ok: true, summary: 'Playhead moved to 0s' }, 20);
    s = ev(s, { kind: 'done' }, 30);
    expect(s.busySince).toBeNull();
    // A straggler (a tool call or a thinking beat) is still shown but never restarts the spinner.
    s = ev(s, { kind: 'thinking', ms: 500 }, 40);
    expect(s.busySince).toBeNull();
    s = ev(s, { kind: 'tool-start', id: 't2', name: 'get_project', args: {} }, 50);
    expect(s.busySince).toBeNull();
    expect(s.entries.at(-1)).toMatchObject({ kind: 'tool', id: 't2', status: 'running' });
    s = ev(s, { kind: 'tool-end', id: 't2', ok: true, summary: 'ok' }, 60);
    expect(s.busySince).toBeNull();
    // A new prompt starts the next turn, and its spinner.
    s = ev(s, { kind: 'user', text: 'Again' }, 70);
    s = transcriptReducer(s, { type: 'submit', now: 80 });
    expect(s.busySince).toBe(80);
    s = ev(s, { kind: 'tool-start', id: 't3', name: 'get_project', args: {} }, 90);
    expect(s.busySince).toBe(80);
  });

  it('marks a tool line done with its result summary, matched by id', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'tool-start', id: 't1', name: 'add_boundary', args: { name: 'France' } });
    s = ev(s, { kind: 'tool-start', id: 't2', name: 'add_route', args: { from: 'Paris' } });
    s = ev(s, { kind: 'tool-end', id: 't2', ok: false, summary: 'No route found' });
    s = ev(s, { kind: 'tool-end', id: 't1', ok: true, summary: 'Added boundary France' });
    expect(s.entries).toEqual([
      { kind: 'tool', id: 't1', title: 'lilmappo - add_boundary (MCP)', args: 'name: "France"', status: 'ok', summary: 'Added boundary France' },
      { kind: 'tool', id: 't2', title: 'lilmappo - add_route (MCP)', args: 'from: "Paris"', status: 'error', summary: 'No route found' },
    ]);
  });

  it('ignores a tool end with no matching start', () => {
    const s = ev(INITIAL_TRANSCRIPT, { kind: 'tool-end', id: 'nope', ok: true, summary: 'x' });
    expect(s).toEqual(INITIAL_TRANSCRIPT);
  });

  it('clears back to the welcome screen', () => {
    const s = ev(INITIAL_TRANSCRIPT, { kind: 'text', text: 'x' });
    expect(transcriptReducer(s, { type: 'clear' })).toEqual(INITIAL_TRANSCRIPT);
  });
});

describe('spinner words', () => {
  it('has no repeats in the list, and a stride that visits every word before any returns', () => {
    expect(new Set(SPINNER_VERBS).size).toBe(SPINNER_VERBS.length);
    expect(SPINNER_VERBS.length).toBeGreaterThanOrEqual(40);
    const walk = Array.from({ length: SPINNER_VERBS.length }, (_, i) => spinnerVerb(i));
    expect(new Set(walk).size).toBe(SPINNER_VERBS.length);
    expect(spinnerVerb(SPINNER_VERBS.length)).toBe(spinnerVerb(0));
  });

  it('never shows the same word for two requests in a row', () => {
    for (let i = 0; i < 300; i++) expect(spinnerVerb(i + 1)).not.toBe(spinnerVerb(i));
  });

  it('is the same walk every time', () => {
    expect([0, 1, 2, 3].map(spinnerVerb)).toEqual([0, 1, 2, 3].map(spinnerVerb));
  });

  it('moves to the next word with each thinking beat and each tool result, not with the turn', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'user', text: 'Go' });
    s = transcriptReducer(s, { type: 'submit', now: 0 });
    expect(s.requests).toBe(0);
    s = ev(s, { kind: 'thinking', ms: 500 }, 10);
    expect(s.requests).toBe(1);
    s = ev(s, { kind: 'tool-start', id: 't1', name: 'get_guide', args: {} }, 20);
    expect(s.requests).toBe(1);
    s = ev(s, { kind: 'tool-end', id: 't1', ok: true, summary: 'ok' }, 30);
    expect(s.requests).toBe(2);
    // A tool end with no matching start is no request.
    s = ev(s, { kind: 'tool-end', id: 'nope', ok: true, summary: 'x' }, 40);
    expect(s.requests).toBe(2);
    expect(spinnerVerb(s.requests)).not.toBe(spinnerVerb(1));
  });
});

describe('spinner counter', () => {
  it('formats tokens and durations as Claude Code does', () => {
    expect(formatTokens(847)).toBe('847 tokens');
    expect(formatTokens(1400)).toBe('1.4k tokens');
    expect(formatTokens(12345)).toBe('12.3k tokens');
    expect(formatSeconds(0)).toBe('0s');
    expect(formatSeconds(59.9)).toBe('59s');
    expect(formatSeconds(60)).toBe('1m 0s');
    expect(formatSeconds(134)).toBe('2m 14s');
  });

  it('grows with what the agent writes and with the clock, never down', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'thinking', ms: 1200 }, 0);
    const seen = [spinnerTokens(s, 0)];
    s = ev(s, { kind: 'text', text: 'I will start by reading the editor guide.' }, 1200);
    seen.push(spinnerTokens(s, 1200));
    s = ev(s, { kind: 'tool-start', id: 't1', name: 'add_boundary', args: { query: 'France', detail: 'detailed' } }, 1500);
    seen.push(spinnerTokens(s, 1500));
    seen.push(spinnerTokens(s, 30_000), spinnerTokens(s, 90_000));
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('starts from zero on each prompt', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'text', text: 'x'.repeat(400) }, 0);
    expect(s.tokens).toBeGreaterThan(0);
    s = ev(s, { kind: 'done' }, 10);
    s = ev(s, { kind: 'user', text: 'Again' }, 20);
    s = transcriptReducer(s, { type: 'submit', now: 30 });
    expect(s.tokens).toBe(0);
  });
});

describe('thinking lines', () => {
  it('shows a thinking marker while a long beat runs, then leaves `Thought for Ns`, in front of what came next', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'thinking', ms: 2000 }, 0);
    expect(s.thinking).toEqual({ ms: 2000 });
    expect(s.entries).toEqual([]);
    s = ev(s, { kind: 'text', text: 'Now the France outline.' }, 2000);
    expect(s.thinking).toBeNull();
    expect(s.entries).toEqual([
      { kind: 'thought', seconds: 2 },
      { kind: 'text', text: 'Now the France outline.' },
    ]);
  });

  it('rounds the beat to seconds, at least one', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'thinking', ms: 1499 });
    s = ev(s, { kind: 'text', text: 'a' });
    s = ev(s, { kind: 'thinking', ms: 1500 });
    s = ev(s, { kind: 'text', text: 'b' });
    expect(s.entries.filter((e) => e.kind === 'thought')).toEqual([
      { kind: 'thought', seconds: 1 },
      { kind: 'thought', seconds: 2 },
    ]);
    expect(THOUGHT_MIN_MS).toBe(1000);
  });

  it('leaves nothing for a short beat, though the spinner still moves on', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'thinking', ms: THOUGHT_MIN_MS - 1 }, 0);
    expect(s.thinking).toBeNull();
    expect(s.requests).toBe(1);
    s = ev(s, { kind: 'text', text: 'x' }, 900);
    expect(s.entries).toEqual([{ kind: 'text', text: 'x' }]);
  });

  it('settles a beat when the next beat or done follows', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'thinking', ms: 1200 }, 0);
    s = ev(s, { kind: 'thinking', ms: 1500 }, 1200);
    s = ev(s, { kind: 'done' }, 2700);
    expect(s.entries.map((e) => e.kind)).toEqual(['thought', 'thought', 'worked']);
    expect(s.thinking).toBeNull();
  });

  it('ignores a thinking beat that arrives after done', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'thinking', ms: 200 }, 0);
    s = ev(s, { kind: 'done' }, 1000);
    const before = s;
    s = ev(s, { kind: 'thinking', ms: 3000 }, 1100);
    expect(s).toEqual(before);
  });
});

describe('worked footer', () => {
  it('lands under the last message when the turn ends, and the spinner goes', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'user', text: 'Go' });
    s = transcriptReducer(s, { type: 'submit', now: 1000 });
    s = ev(s, { kind: 'text', text: 'Your map is ready.' }, 133_000);
    s = ev(s, { kind: 'done' }, 135_900);
    expect(s.busySince).toBeNull();
    expect(s.entries.at(-2)).toEqual({ kind: 'text', text: 'Your map is ready.' });
    expect(s.entries.at(-1)).toEqual({ kind: 'worked', seconds: 134 });
  });

  it('is once per turn: a second done, or one with no turn running, adds none', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'done' }, 5);
    expect(s.entries).toEqual([]);
    s = ev(INITIAL_TRANSCRIPT, { kind: 'thinking', ms: 100 }, 0);
    s = ev(s, { kind: 'done' }, 4000);
    s = ev(s, { kind: 'done' }, 5000);
    expect(s.entries).toEqual([{ kind: 'worked', seconds: 4 }]);
  });

  it('counts a quick turn as one second at least', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'thinking', ms: 100 }, 0);
    s = ev(s, { kind: 'done' }, 200);
    expect(s.entries).toEqual([{ kind: 'worked', seconds: 1 }]);
  });

  it('wipes all of it on clear', () => {
    let s = ev(INITIAL_TRANSCRIPT, { kind: 'thinking', ms: 2000 }, 0);
    s = ev(s, { kind: 'text', text: 'x' }, 2000);
    s = ev(s, { kind: 'thinking', ms: 2000 }, 2100);
    expect(transcriptReducer(s, { type: 'clear' })).toEqual(INITIAL_TRANSCRIPT);
    s = ev(s, { kind: 'done' }, 5000);
    expect(transcriptReducer(s, { type: 'clear' })).toEqual(INITIAL_TRANSCRIPT);
  });
});
