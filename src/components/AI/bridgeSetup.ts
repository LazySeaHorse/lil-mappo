import { BRIDGE_MCP_URL } from '@/agent';

/**
 * What the bridge guide shows: which binary to download for this computer, how to start it,
 * and how each coding agent adds it as an MCP server. Kept apart from the dialog so it can be tested.
 */

/** Every release asset of the "Build bridge" workflow. */
export type BridgeTarget = 'darwin-arm64' | 'darwin-amd64' | 'windows-amd64' | 'windows-arm64' | 'linux-amd64' | 'linux-arm64';

export const BRIDGE_TARGETS: Array<{ id: BridgeTarget; label: string }> = [
  { id: 'darwin-arm64', label: 'macOS (Apple silicon)' },
  { id: 'darwin-amd64', label: 'macOS (Intel)' },
  { id: 'windows-amd64', label: 'Windows' },
  { id: 'windows-arm64', label: 'Windows (ARM)' },
  { id: 'linux-amd64', label: 'Linux (x64)' },
  { id: 'linux-arm64', label: 'Linux (ARM)' },
];

/** The repo's releases only carry the bridge, so the latest release always has these files. */
const RELEASES = 'https://github.com/LazySeaHorse/lil-mappo/releases/latest/download';

export function bridgeFileName(target: BridgeTarget): string {
  return `lil-mappo-bridge-${target}${target.startsWith('windows') ? '.exe' : ''}`;
}

export function bridgeDownloadUrl(target: BridgeTarget): string {
  return `${RELEASES}/${bridgeFileName(target)}`;
}

/**
 * macOS and Linux: browsers save the file without the "run me" permission, and macOS also
 * quarantines it, so the bridge is started from a terminal. `xattr -c` succeeds even when
 * there is nothing to clear, which keeps the chain going.
 */
export function bridgeRunCommand(target: BridgeTarget): string | null {
  if (target.startsWith('windows')) return null;
  const file = bridgeFileName(target);
  const unquarantine = target.startsWith('darwin') ? ` && xattr -c ${file}` : '';
  return `cd ~/Downloads && chmod +x ${file}${unquarantine} && ./${file}`;
}

interface NavigatorUAData {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
}

function uaData(): NavigatorUAData | undefined {
  return (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
}

/**
 * Best guess from what the browser says synchronously. Macs default to Apple silicon (Safari
 * reports Intel on every Mac), Windows and Linux to x64; `refineBridgeTarget` corrects the chip.
 */
export function detectBridgeTarget(): BridgeTarget {
  const platform = `${uaData()?.platform ?? ''} ${navigator.platform ?? ''} ${navigator.userAgent}`.toLowerCase();
  if (platform.includes('win')) return 'windows-amd64';
  if (platform.includes('mac')) return 'darwin-arm64';
  if (platform.includes('linux') || platform.includes('x11')) {
    return /aarch64|arm/.test(platform) ? 'linux-arm64' : 'linux-amd64';
  }
  return 'darwin-arm64';
}

/** Chromium browsers can tell ARM from x86; others keep the first guess. */
export async function refineBridgeTarget(guess: BridgeTarget): Promise<BridgeTarget> {
  try {
    const arch = (await uaData()?.getHighEntropyValues?.(['architecture']))?.architecture;
    if (!arch) return guess;
    const os = guess.split('-')[0];
    return `${os}-${arch === 'arm' ? 'arm64' : 'amd64'}` as BridgeTarget;
  } catch {
    return guess;
  }
}

/* ---------- connecting a coding agent ---------- */

/** A step of a client's setup: text, then optionally something to copy or a one-click install link. */
export interface ClientStep {
  text: string;
  copy?: string;
  link?: { label: string; href: string };
}

export interface ClientVariant {
  id: string;
  label: string;
  steps: ClientStep[];
}

export interface CodingClient {
  id: string;
  label: string;
  /** One or two ways to use it (CLI, app, editor), each with its own steps. */
  variants: ClientVariant[];
  note?: string;
}

const NAME = 'lil-mappo';

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** Cursor's install link carries the mcp.json entry as base64. */
export function cursorInstallLink(url = BRIDGE_MCP_URL): string {
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${NAME}&config=${encodeURIComponent(btoa(JSON.stringify({ url })))}`;
}

/** VS Code's install link carries the server entry as URL-encoded JSON. */
export function vscodeInstallLink(url = BRIDGE_MCP_URL): string {
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: NAME, type: 'http', url }))}`;
}

export function codingClients(url = BRIDGE_MCP_URL): CodingClient[] {
  const cursorJson = json({ mcpServers: { [NAME]: { url } } });
  return [
    {
      id: 'claude',
      label: 'Claude',
      variants: [
        {
          id: 'cli',
          label: 'Claude Code',
          steps: [
            { text: 'In a terminal, run:', copy: `claude mcp add --scope user --transport http ${NAME} ${url}` },
            { text: 'Then start a new Claude Code session.' },
          ],
        },
      ],
      note: 'The Claude chat app can’t reach apps on your computer, so use Claude Code.',
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      variants: [
        {
          id: 'cli',
          label: 'CLI',
          steps: [
            { text: 'In a terminal, run:', copy: `agy mcp add ${NAME} ${url}` },
            { text: 'The Antigravity app picks this up too.' },
          ],
        },
        {
          id: 'app',
          label: 'App & IDE',
          steps: [
            {
              text: 'Open ~/.gemini/config/mcp_config.json (in the IDE: ⋯ at the top of the agent panel → MCP Servers → Manage MCP Servers → View raw config) and add:',
              copy: json({ mcpServers: { [NAME]: { serverUrl: url } } }),
            },
            { text: 'Save, then click Refresh under Settings → Customizations → Installed MCP Servers.' },
          ],
        },
      ],
    },
    {
      id: 'codex',
      label: 'Codex',
      variants: [
        {
          id: 'cli',
          label: 'CLI',
          steps: [
            { text: 'In a terminal, run:', copy: `codex mcp add ${NAME} --url ${url}` },
            { text: 'The ChatGPT desktop app picks this up too.' },
          ],
        },
        {
          id: 'app',
          label: 'ChatGPT app',
          steps: [
            { text: `In the ChatGPT desktop app, open Settings → MCP servers → Add server. Name it ${NAME}, choose Streamable HTTP and paste:`, copy: url },
            { text: 'Save, then click Restart.' },
          ],
        },
      ],
    },
    {
      id: 'cursor',
      label: 'Cursor',
      variants: [
        {
          id: 'editor',
          label: 'Editor',
          steps: [
            { text: 'Click to add it to Cursor:', link: { label: 'Add to Cursor', href: cursorInstallLink(url) } },
            { text: 'Or add this to ~/.cursor/mcp.json:', copy: cursorJson },
          ],
        },
        {
          id: 'cli',
          label: 'CLI',
          steps: [
            { text: 'The Cursor CLI uses the editor’s settings, so if you added it there you’re done. Otherwise add this to ~/.cursor/mcp.json:', copy: cursorJson },
          ],
        },
      ],
    },
    {
      id: 'copilot',
      label: 'Copilot',
      variants: [
        {
          id: 'vscode',
          label: 'VS Code',
          steps: [
            { text: 'Click to add it to VS Code:', link: { label: 'Add to VS Code', href: vscodeInstallLink(url) } },
            { text: 'Or run “MCP: Add Server” from the Command Palette, choose HTTP and paste:', copy: url },
            { text: 'Then use Copilot Chat in Agent mode.' },
          ],
        },
        {
          id: 'cli',
          label: 'CLI',
          steps: [{ text: 'In a terminal, run:', copy: `copilot mcp add --transport http ${NAME} ${url}` }],
        },
      ],
    },
  ];
}
