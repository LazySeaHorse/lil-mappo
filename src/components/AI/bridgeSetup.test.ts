import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_MCP_URL } from '@/agent';
import {
  BRIDGE_TARGETS, bridgeDownloadUrl, bridgeRunCommand, codingClients, cursorInstallLink, detectBridgeTarget,
  refineBridgeTarget, vscodeInstallLink,
} from './bridgeSetup';

function fakeBrowser({ userAgent = '', platform = '', uaData }: { userAgent?: string; platform?: string; uaData?: unknown }) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
  Object.defineProperty(navigator, 'userAgentData', { value: uaData, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as unknown as { userAgentData?: unknown }).userAgentData;
});

describe('downloads', () => {
  it('links every target to its file in the latest release', () => {
    expect(bridgeDownloadUrl('windows-amd64')).toBe('https://github.com/LazySeaHorse/lil-mappo/releases/latest/download/lil-mappo-bridge-windows-amd64.exe');
    expect(bridgeDownloadUrl('darwin-arm64')).toMatch(/\/lil-mappo-bridge-darwin-arm64$/);
    expect(BRIDGE_TARGETS).toHaveLength(6);
  });

  it('starts it from Downloads on macOS and Linux, making it runnable first, and clears the quarantine on macOS', () => {
    expect(bridgeRunCommand('darwin-arm64')).toBe(
      'cd ~/Downloads && chmod +x lil-mappo-bridge-darwin-arm64 && xattr -c lil-mappo-bridge-darwin-arm64 && ./lil-mappo-bridge-darwin-arm64',
    );
    expect(bridgeRunCommand('linux-amd64')).toBe('cd ~/Downloads && chmod +x lil-mappo-bridge-linux-amd64 && ./lil-mappo-bridge-linux-amd64');
    expect(bridgeRunCommand('windows-arm64')).toBeNull();
  });
});

describe('detecting the computer', () => {
  it('reads the OS from the browser, guessing Apple silicon on a Mac and x64 elsewhere', () => {
    fakeBrowser({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel' });
    expect(detectBridgeTarget()).toBe('darwin-arm64');
    fakeBrowser({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' });
    expect(detectBridgeTarget()).toBe('windows-amd64');
    fakeBrowser({ userAgent: 'Mozilla/5.0 (X11; Linux aarch64)', platform: 'Linux aarch64' });
    expect(detectBridgeTarget()).toBe('linux-arm64');
  });

  it('corrects the chip when the browser reports it', async () => {
    fakeBrowser({ uaData: { getHighEntropyValues: async () => ({ architecture: 'x86' }) } });
    expect(await refineBridgeTarget('darwin-arm64')).toBe('darwin-amd64');
    fakeBrowser({ uaData: { getHighEntropyValues: async () => ({ architecture: 'arm' }) } });
    expect(await refineBridgeTarget('windows-amd64')).toBe('windows-arm64');
  });

  it('keeps the guess when the browser cannot tell', async () => {
    fakeBrowser({});
    expect(await refineBridgeTarget('darwin-arm64')).toBe('darwin-arm64');
    fakeBrowser({ uaData: { getHighEntropyValues: async () => { throw new Error('denied'); } } });
    expect(await refineBridgeTarget('linux-amd64')).toBe('linux-amd64');
  });
});

describe('coding clients', () => {
  const clients = codingClients();
  const steps = (id: string, variant: string) =>
    clients.find((c) => c.id === id)!.variants.find((v) => v.id === variant)!.steps;
  const copied = (id: string, variant: string) => steps(id, variant).map((s) => s.copy).filter(Boolean).join('\n');

  it('covers Claude, Antigravity, Codex, Cursor and Copilot, each with the bridge URL to paste', () => {
    expect(clients.map((c) => c.label)).toEqual(['Claude', 'Antigravity', 'Codex', 'Cursor', 'Copilot']);
    for (const client of clients) {
      for (const variant of client.variants) {
        expect(variant.steps.some((s) => s.copy?.includes(BRIDGE_MCP_URL))).toBe(true);
      }
    }
  });

  it('uses each CLI’s own syntax', () => {
    expect(copied('claude', 'cli')).toBe(`claude mcp add --scope user --transport http lil-mappo ${BRIDGE_MCP_URL}`);
    expect(copied('antigravity', 'cli')).toBe(`agy mcp add lil-mappo ${BRIDGE_MCP_URL}`);
    expect(copied('codex', 'cli')).toBe(`codex mcp add lil-mappo --url ${BRIDGE_MCP_URL}`);
    expect(copied('copilot', 'cli')).toBe(`copilot mcp add --transport http lil-mappo ${BRIDGE_MCP_URL}`);
  });

  it('gives Antigravity serverUrl and Cursor url in their config files', () => {
    expect(JSON.parse(copied('antigravity', 'app'))).toEqual({ mcpServers: { 'lil-mappo': { serverUrl: BRIDGE_MCP_URL } } });
    expect(JSON.parse(copied('cursor', 'cli'))).toEqual({ mcpServers: { 'lil-mappo': { url: BRIDGE_MCP_URL } } });
  });

  it('builds one-click install links for Cursor and VS Code', () => {
    const cursor = new URL(cursorInstallLink());
    expect(cursor.protocol).toBe('cursor:');
    expect(cursor.searchParams.get('name')).toBe('lil-mappo');
    expect(JSON.parse(atob(cursor.searchParams.get('config')!))).toEqual({ url: BRIDGE_MCP_URL });

    const vscode = vscodeInstallLink();
    expect(vscode.startsWith('vscode:mcp/install?')).toBe(true);
    expect(JSON.parse(decodeURIComponent(vscode.split('?')[1]))).toEqual({ name: 'lil-mappo', type: 'http', url: BRIDGE_MCP_URL });
    expect(steps('cursor', 'editor')[0].link?.href).toBe(cursorInstallLink());
    expect(steps('copilot', 'vscode')[0].link?.href).toBe(vscode);
  });
});
