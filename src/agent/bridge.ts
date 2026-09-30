import type { AgentToolDescriptor } from './defineTool';

/**
 * Client for the local lil-mappo-bridge (bridge/main.go), which exposes these
 * tools over MCP to coding agents on the same machine. Protocol (JSON text):
 *   tab -> bridge  {type:'tools', tools:[...]}            once per connection
 *   bridge -> tab  {type:'call', id, name, input}
 *   tab -> bridge  {type:'result', id, result}            result is an AgentToolResult
 * The tab dials out because a page cannot listen. Keeps retrying while enabled.
 */

export const BRIDGE_URL = 'ws://127.0.0.1:47800/page';
/** Close code the bridge uses when another tab took over; do not reconnect. */
const REPLACED = 4000;
const MAX_DELAY_MS = 30_000;

/** Returns a disconnect function. `onStatus` reports whether the bridge link is up. */
export function connectBridge(
  tools: AgentToolDescriptor[],
  onStatus: (connected: boolean) => void,
  url: string = BRIDGE_URL,
): () => void {
  if (typeof WebSocket === 'undefined') return () => {};
  const byName = new Map(tools.map((t) => [t.name, t]));
  const manifest = JSON.stringify({
    type: 'tools',
    tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({
      name, title, description, inputSchema, annotations,
    })),
  });

  let stopped = false;
  let sock: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = 1000;

  const open = () => {
    const ws = new WebSocket(url);
    sock = ws;
    ws.onopen = () => {
      delay = 1000;
      ws.send(manifest);
      onStatus(true);
    };
    ws.onmessage = async (e) => {
      let msg: { type?: string; id?: number; name?: string; input?: unknown };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.type !== 'call') return;
      const tool = msg.name ? byName.get(msg.name) : undefined;
      const result = tool
        ? await tool.execute(msg.input)
        : { content: [{ type: 'text', text: `Unknown tool: ${msg.name}` }], isError: true };
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id: msg.id, result }));
    };
    ws.onclose = (e) => {
      if (sock === ws) onStatus(false);
      if (stopped || e.code === REPLACED) return;
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    };
  };
  open();

  return () => {
    stopped = true;
    clearTimeout(timer);
    sock?.close();
  };
}
