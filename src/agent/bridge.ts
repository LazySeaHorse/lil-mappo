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
/** Where coding agents reach the bridge over MCP (streamable HTTP). */
export const BRIDGE_MCP_URL = 'http://127.0.0.1:47800/mcp';
/** Close code the bridge uses when another tab took over; do not reconnect. */
const REPLACED = 4000;
const MAX_DELAY_MS = 30_000;

/**
 * The link to the bridge: `connecting` until a first answer, `connected` while it is up,
 * `unreachable` when nothing answered since this tab started dialling (no bridge running; it
 * keeps retrying), `connecting` again after a drop, `elsewhere` when another tab took it over.
 */
export type BridgeStatus = 'connecting' | 'connected' | 'unreachable' | 'elsewhere';

/** Returns a disconnect function. `onStatus` reports the link as it changes (see `BridgeStatus`). */
export function connectBridge(
  tools: AgentToolDescriptor[],
  onStatus: (status: BridgeStatus) => void,
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
  let everConnected = false;

  const open = () => {
    const ws = new WebSocket(url);
    sock = ws;
    ws.onopen = () => {
      delay = 1000;
      everConnected = true;
      ws.send(manifest);
      onStatus('connected');
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
      if (stopped || sock !== ws) return;
      if (e.code === REPLACED) {
        onStatus('elsewhere');
        return;
      }
      onStatus(everConnected ? 'connecting' : 'unreachable');
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    };
  };
  onStatus('connecting');
  open();

  return () => {
    stopped = true;
    clearTimeout(timer);
    sock?.close();
  };
}
