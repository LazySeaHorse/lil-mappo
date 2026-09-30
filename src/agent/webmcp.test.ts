import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWebMcpSupported, registerWebMcpTool } from './webmcp';
import type { AgentToolDescriptor } from './defineTool';

const tool: AgentToolDescriptor = {
  name: 't',
  title: 'T',
  description: 'd',
  inputSchema: { type: 'object' },
  annotations: { title: 'T', readOnlyHint: true, destructiveHint: false },
  execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
};

type Holder = { modelContext?: unknown };
const doc = document as unknown as Holder;
const nav = navigator as unknown as Holder;

afterEach(() => {
  delete doc.modelContext;
  delete nav.modelContext;
});

describe('webmcp adapter', () => {
  it('is unsupported without an API and registers nothing', () => {
    expect(isWebMcpSupported()).toBe(false);
    expect(registerWebMcpTool(tool)).toBeNull();
  });

  it('prefers document.modelContext and unregisters via the signal', () => {
    const registerTool = vi.fn();
    doc.modelContext = { registerTool };
    nav.modelContext = { registerTool: vi.fn() };
    const off = registerWebMcpTool(tool)!;
    expect(registerTool).toHaveBeenCalledTimes(1);
    const [desc, opts] = registerTool.mock.calls[0];
    expect(desc).toMatchObject({ name: 't', title: 'T', annotations: { readOnlyHint: true, destructiveHint: false } });
    expect(opts.signal.aborted).toBe(false);
    off();
    expect(opts.signal.aborted).toBe(true);
    off();
  });

  it('falls back to navigator.modelContext and unregisterTool', () => {
    const unregisterTool = vi.fn();
    nav.modelContext = { registerTool: vi.fn(), unregisterTool };
    expect(isWebMcpSupported()).toBe(true);
    registerWebMcpTool(tool)!();
    expect(unregisterTool).toHaveBeenCalledWith('t');
  });

  it('returns null when registration throws', () => {
    doc.modelContext = { registerTool: () => { throw new Error('NotAllowedError'); } };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(registerWebMcpTool(tool)).toBeNull();
  });
});
