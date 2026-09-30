import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectBridge } from './bridge';
import type { AgentToolDescriptor } from './defineTool';

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.onclose?.({ code: 1000 });
  }
}

const tool: AgentToolDescriptor = {
  name: 'echo',
  title: 'Echo',
  description: 'd',
  inputSchema: { type: 'object' },
  annotations: { title: 'Echo', readOnlyHint: true, destructiveHint: false },
  execute: async (input) => ({ content: [{ type: 'text', text: JSON.stringify(input) }] }),
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('connectBridge', () => {
  it('announces tools, runs calls and replies with the result', async () => {
    const status = vi.fn();
    connectBridge([tool], status);
    const ws = FakeSocket.instances[0];
    ws.onopen?.();
    expect(status).toHaveBeenCalledWith(true);
    const manifest = JSON.parse(ws.sent[0]);
    expect(manifest.type).toBe('tools');
    expect(manifest.tools[0]).not.toHaveProperty('execute');

    ws.onmessage?.({ data: JSON.stringify({ type: 'call', id: 7, name: 'echo', input: { a: 1 } }) });
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
    expect(JSON.parse(ws.sent[1])).toEqual({
      type: 'result', id: 7, result: { content: [{ type: 'text', text: '{"a":1}' }] },
    });
  });

  it('answers unknown tools with an error result', async () => {
    connectBridge([tool], vi.fn());
    const ws = FakeSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: 'call', id: 1, name: 'nope' }) });
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
    expect(JSON.parse(ws.sent[1]).result.isError).toBe(true);
  });

  it('retries after a drop, but not when replaced or disconnected', () => {
    const status = vi.fn();
    const disconnect = connectBridge([tool], status);
    FakeSocket.instances[0].onclose?.({ code: 1006 });
    expect(status).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);

    FakeSocket.instances[1].onclose?.({ code: 4000 });
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(2);

    disconnect();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
