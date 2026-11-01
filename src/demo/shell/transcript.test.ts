import { describe, expect, it } from 'vitest';
import type { DemoAiEvent } from '../protocol';
import { INITIAL_TRANSCRIPT, formatToolArgs, formatToolTitle, transcriptReducer, type TranscriptState } from './transcript';

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
