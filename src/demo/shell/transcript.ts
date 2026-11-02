import type { DemoAiEvent } from '../protocol';

/** The mock Claude Code session, as pure state: what is on screen and what is being typed. */

export type TranscriptEntry =
  | { kind: 'user'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; title: string; args: string; status: 'running' | 'ok' | 'error'; summary: string | null }
  /** A finished extended-thinking beat, collapsed as Claude Code shows it: `∴ Thought for 3s`. */
  | { kind: 'thought'; seconds: number }
  /** The footer under a turn's last message: `✻ Worked for 2m 14s`. */
  | { kind: 'worked'; seconds: number };

export interface TranscriptState {
  entries: TranscriptEntry[];
  /** The prompt being typed into the input box; `shown` characters are visible so far. */
  typing: { text: string; shown: number } | null;
  /** Claude is working: the spinner line shows, counting from `busySince`. */
  busySince: number | null;
  /** Model requests so far (one per thinking beat and per tool result): each one gets the next spinner verb. */
  requests: number;
  /** What the agent has written this turn, in tokens: the spinner's counter starts from here and grows with the clock. */
  tokens: number;
  /** A thinking beat under way that will leave a `thought` line when it ends (the next event ends it). */
  thinking: { ms: number } | null;
  /** The turn is over (`done`): the spinner stays off until the next prompt is sent, whatever else arrives. */
  ended: boolean;
}

export type TranscriptAction =
  | { type: 'event'; event: DemoAiEvent; now: number }
  /** One more character of the typed prompt is visible. */
  | { type: 'type-tick' }
  /** The typed prompt is sent: it moves from the input box into the transcript. */
  | { type: 'submit'; now: number }
  | { type: 'clear' };

export const INITIAL_TRANSCRIPT: TranscriptState = { entries: [], typing: null, busySince: null, requests: 0, tokens: 0, thinking: null, ended: false };

const MCP_SERVER = 'lilmappo';

/** Thinking beats shorter than this leave no `Thought for` line. */
export const THOUGHT_MIN_MS = 1000;
/** Thinking costs this many ms per token on the spinner's counter. */
const THINKING_MS_PER_TOKEN = 6;
/** How fast the spinner's counter climbs on its own while Claude works. */
const TOKENS_PER_SECOND = 5;

/** Four characters to the token, near enough for a counter nobody checks. */
const approxTokens = (chars: number) => Math.ceil(chars / 4);

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

/** A thinking beat that has run its length leaves its collapsed `Thought for Ns` line (at least 1s). */
function endThinking(state: TranscriptState): TranscriptState {
  if (!state.thinking) return state;
  const seconds = Math.max(1, Math.round(state.thinking.ms / 1000));
  return { ...state, entries: [...state.entries, { kind: 'thought', seconds }], thinking: null };
}

/** Before any other event lands, a prompt still being typed is sent whole, so lines never interleave. */
function flushTyping(state: TranscriptState, now: number): TranscriptState {
  if (!state.typing) return state;
  return {
    ...state,
    entries: [...state.entries, { kind: 'user', text: state.typing.text }],
    typing: null,
    busySince: now,
    tokens: 0,
    ended: false,
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
      // Any event ends a thinking beat in progress: its line lands before whatever came next.
      const s = endThinking(flushTyping(state, now));
      switch (event.kind) {
        case 'thinking': {
          // After `done` the turn is over: a late beat must not start a spinner nothing will stop.
          if (s.ended) return s;
          return {
            ...s,
            busySince: s.busySince ?? now,
            requests: s.requests + 1,
            tokens: s.tokens + Math.round(event.ms / THINKING_MS_PER_TOKEN),
            // Only beats long enough to read as thinking leave a line; the tiny ones would be noise.
            thinking: event.ms >= THOUGHT_MIN_MS ? { ms: event.ms } : null,
          };
        }
        case 'text':
          return { ...s, tokens: s.tokens + approxTokens(event.text.length), entries: [...s.entries, { kind: 'text', text: event.text }] };
        case 'tool-start':
          return {
            ...s,
            busySince: s.ended ? null : (s.busySince ?? now),
            tokens: s.tokens + 30 + approxTokens(JSON.stringify(event.args ?? null).length),
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
          if (!hit) return s;
          // The result goes back to the model: that is a new request, so the spinner moves on to the next word.
          return { ...s, entries, requests: s.ended ? s.requests : s.requests + 1 };
        }
        case 'done': {
          // The footer once: a second `done`, or one with no spinner running, adds nothing.
          const worked: TranscriptEntry[] =
            s.busySince === null ? [] : [{ kind: 'worked', seconds: Math.max(1, Math.floor((now - s.busySince) / 1000)) }];
          return { ...s, entries: [...s.entries, ...worked], busySince: null, ended: true };
        }
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

/** Spinner words, in the spirit of Claude Code's own list, with a few for maps. */
export const SPINNER_VERBS = [
  'Moseying', 'Pondering', 'Percolating', 'Noodling', 'Cogitating', 'Conjuring', 'Brewing', 'Simmering',
  'Wrangling', 'Schlepping', 'Finagling', 'Spelunking', 'Marinating', 'Puttering', 'Whirring', 'Musing',
  'Ruminating', 'Tinkering', 'Herding', 'Honking', 'Vibing', 'Clauding', 'Thinking', 'Mulling',
  'Mapping', 'Charting', 'Plotting', 'Navigating', 'Wayfinding', 'Cartographing', 'Meandering', 'Trailblazing',
  'Orienteering', 'Triangulating', 'Surveying', 'Pathfinding', 'Contouring', 'Zooming', 'Panning', 'Scouting',
  'Roaming', 'Detouring', 'Idling', 'Fiddling', 'Dithering', 'Doodling', 'Weaving', 'Sketching',
  'Unfurling', 'Folding', 'Pinpointing', 'Orbiting', 'Gliding', 'Shimmying', 'Hatching', 'Churning',
  'Crunching', 'Humming', 'Frolicking', 'Lollygagging',
];

/** Coprime to the list's length (checked by a test), so the walk visits every word before it repeats and never stays put. */
const VERB_STRIDE = 17;

/** The spinner word for the n-th model request: a fixed shuffle, never the same word twice in a row. */
export function spinnerVerb(request: number): string {
  const n = Math.max(0, Math.floor(request));
  return SPINNER_VERBS[(n * VERB_STRIDE) % SPINNER_VERBS.length];
}

/** `45s`, or `2m 14s` from a minute up. */
export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** `847 tokens`, `1.4k tokens`. */
export function formatTokens(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n < 1000 ? `${n} tokens` : `${(n / 1000).toFixed(1)}k tokens`;
}

/** The counter on the spinner line: what the agent has written so far, plus a steady climb while it works. */
export function spinnerTokens(state: Pick<TranscriptState, 'tokens'>, elapsedMs: number): number {
  return state.tokens + Math.floor((Math.max(0, elapsedMs) / 1000) * TOKENS_PER_SECOND);
}
