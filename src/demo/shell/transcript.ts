import type { DemoAiEvent } from '../protocol';

/** The mock Claude Code session, as pure state: what is on screen and what is being typed. */

export type TranscriptEntry =
  | { kind: 'user'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; title: string; args: string; status: 'running' | 'ok' | 'error'; summary: string | null };

export interface TranscriptState {
  entries: TranscriptEntry[];
  /** The prompt being typed into the input box; `shown` characters are visible so far. */
  typing: { text: string; shown: number } | null;
  /** Claude is working: the spinner line shows, counting from `busySince`. */
  busySince: number | null;
  /** Counts the turns, so each one gets its own spinner verb. */
  turn: number;
}

export type TranscriptAction =
  | { type: 'event'; event: DemoAiEvent; now: number }
  /** One more character of the typed prompt is visible. */
  | { type: 'type-tick' }
  /** The typed prompt is sent: it moves from the input box into the transcript. */
  | { type: 'submit'; now: number }
  | { type: 'clear' };

export const INITIAL_TRANSCRIPT: TranscriptState = { entries: [], typing: null, busySince: null, turn: 0 };

const MCP_SERVER = 'lilmappo';

/** `mcp__lilmappo__add_boundary` or `add_boundary` → `lilmappo - add_boundary (MCP)`, as Claude Code titles MCP tools. */
export function formatToolTitle(name: string): string {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  const server = m ? m[1] : MCP_SERVER;
  const tool = m ? m[2] : name;
  return `${server} - ${tool} (MCP)`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(truncate(value, 28));
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const json = JSON.stringify(value);
    return json.length <= 24 ? json : value.length ? '[…]' : '[]';
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return json.length <= 24 ? json : '{…}';
  }
  return '…';
}

/** Tool args as Claude Code prints them after the title: `name: "France", color: "#e11d48", …`. */
export function formatToolArgs(args: unknown, max = 72): string {
  if (args === undefined || args === null) return '';
  if (typeof args !== 'object' || Array.isArray(args)) return truncate(formatValue(args), max);
  const parts = Object.entries(args as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${formatValue(v)}`);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const next = out ? `${out}, ${parts[i]}` : parts[i];
    if (next.length > max) return out ? `${out}, …` : truncate(parts[i], max);
    out = next;
  }
  return out;
}

/** Before any other event lands, a prompt still being typed is sent whole, so lines never interleave. */
function flushTyping(state: TranscriptState, now: number): TranscriptState {
  if (!state.typing) return state;
  return {
    ...state,
    entries: [...state.entries, { kind: 'user', text: state.typing.text }],
    typing: null,
    busySince: now,
    turn: state.turn + 1,
  };
}

export function transcriptReducer(state: TranscriptState, action: TranscriptAction): TranscriptState {
  switch (action.type) {
    case 'clear':
      return INITIAL_TRANSCRIPT;
    case 'type-tick': {
      if (!state.typing || state.typing.shown >= state.typing.text.length) return state;
      return { ...state, typing: { ...state.typing, shown: state.typing.shown + 1 } };
    }
    case 'submit':
      return flushTyping(state, action.now);
    case 'event': {
      const { event, now } = action;
      if (event.kind === 'user') {
        const base = flushTyping(state, now);
        return { ...base, typing: { text: event.text, shown: 0 } };
      }
      const s = flushTyping(state, now);
      switch (event.kind) {
        case 'thinking':
          return s.busySince === null ? { ...s, busySince: now } : s;
        case 'text':
          return { ...s, entries: [...s.entries, { kind: 'text', text: event.text }] };
        case 'tool-start':
          return {
            ...s,
            busySince: s.busySince ?? now,
            entries: [
              ...s.entries,
              { kind: 'tool', id: event.id, title: formatToolTitle(event.name), args: formatToolArgs(event.args), status: 'running', summary: null },
            ],
          };
        case 'tool-end': {
          let hit = false;
          const entries = s.entries.map((e) => {
            if (hit || e.kind !== 'tool' || e.id !== event.id) return e;
            hit = true;
            return { ...e, status: event.ok ? ('ok' as const) : ('error' as const), summary: event.summary };
          });
          return hit ? { ...s, entries } : s;
        }
        case 'done':
          return { ...s, busySince: null };
        default:
          return s;
      }
    }
    default:
      return state;
  }
}

/** Claude Code's spinner frames, played forwards then back. */
export const SPINNER_FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];

const VERBS = ['Thinking', 'Pondering', 'Noodling', 'Percolating', 'Mulling', 'Moseying', 'Cogitating', 'Conjuring'];

export function spinnerVerb(turn: number): string {
  return VERBS[Math.abs(turn) % VERBS.length];
}
