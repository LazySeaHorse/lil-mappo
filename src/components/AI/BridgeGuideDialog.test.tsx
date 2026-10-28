import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useAgentStore, type BridgeStatus } from '@/agent';
import { resetAgentTestState } from '@/agent/testHelpers';
import { AiPanel } from './AiPanel';
import { BridgeGuideDialog } from './BridgeGuideDialog';
import { bridgeDownloadUrl, detectBridgeTarget, vscodeInstallLink } from './bridgeSetup';
import { isBridgeGuideHidden, recordAiConsent } from './aiPrefs';
import { useAiPanelStore } from './useAiPanelStore';
import { PRO, setSignedIn } from './testUtils';

const sub = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: sub.current }) }));
vi.mock('react-secure-storage', () => ({ default: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }));

beforeEach(() => {
  resetAgentTestState();
  useAgentStore.setState({ enabled: false });
  useAiPanelStore.setState({ open: true, tab: 'connect', registeredCount: 0, bridgeStatus: 'off', guideOpen: false, guideOffered: false });
  sub.current = PRO;
  setSignedIn(true);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
});

const guide = () => screen.queryByTestId('bridge-guide');
const toggle = () => screen.getByRole('switch', { name: 'Allow AI agents to control this project' });

describe('Bridge guide', () => {
  it('opens from the help button in the AI panel', () => {
    render(<><AiPanel /><BridgeGuideDialog /></>);
    expect(guide()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'How to connect a coding agent' }));
    expect(guide()).not.toBeNull();
    expect(screen.getByText('Connect your coding agent')).toBeInTheDocument();
  });

  const bridge = (status: BridgeStatus) =>
    act(() => useAiPanelStore.getState().setBridgeStatus(status));

  it('offers itself when AI control is switched on and no bridge answers', () => {
    recordAiConsent();
    render(<><AiPanel /><BridgeGuideDialog /></>);
    fireEvent.click(toggle());
    expect(useAgentStore.getState().enabled).toBe(true);
    bridge('connecting');
    expect(guide()).toBeNull();
    bridge('unreachable');
    expect(guide()).not.toBeNull();
  });

  it('stays closed when a running bridge answers, even if it drops later', () => {
    recordAiConsent();
    render(<><AiPanel /><BridgeGuideDialog /></>);
    fireEvent.click(toggle());
    bridge('connecting');
    bridge('connected');
    bridge('unreachable');
    expect(guide()).toBeNull();
  });

  it('does not offer itself for a bridge that is unreachable without AI control just switched on', () => {
    render(<><AiPanel /><BridgeGuideDialog /></>);
    bridge('unreachable');
    expect(guide()).toBeNull();
  });

  it('stops offering itself after "Don’t show again", but the help button still opens it', () => {
    recordAiConsent();
    useAiPanelStore.setState({ guideOpen: true });
    render(<><AiPanel /><BridgeGuideDialog /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Don’t show again' }));
    expect(guide()).toBeNull();
    expect(isBridgeGuideHidden()).toBe(true);

    fireEvent.click(toggle());
    bridge('unreachable');
    expect(guide()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'How to connect a coding agent' }));
    expect(guide()).not.toBeNull();
  });

  it('downloads the build for this computer', () => {
    useAiPanelStore.setState({ guideOpen: true });
    render(<BridgeGuideDialog />);
    expect(screen.getByRole('link', { name: /Download for/ }).getAttribute('href')).toBe(bridgeDownloadUrl(detectBridgeTarget()));
  });

  it('has a tab per coding agent, with app and CLI setups', () => {
    useAiPanelStore.setState({ guideOpen: true });
    render(<BridgeGuideDialog />);
    for (const name of ['Claude', 'Antigravity', 'Codex', 'Cursor', 'Copilot']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Copilot' }), { button: 0 });
    expect(screen.getByRole('link', { name: /Add to VS Code/ }).getAttribute('href')).toBe(vscodeInstallLink());
    fireEvent.click(screen.getByRole('radio', { name: 'CLI' }));
    expect(screen.getByText(/copilot mcp add/)).toBeInTheDocument();
  });

  it('says when the bridge is connected', () => {
    useAgentStore.setState({ enabled: true });
    useAiPanelStore.setState({ guideOpen: true });
    render(<BridgeGuideDialog />);
    expect(screen.getByTestId('bridge-guide-status').textContent).toMatch(/Waiting for the bridge/);
    act(() => useAiPanelStore.getState().setBridgeStatus('connected'));
    expect(screen.getByTestId('bridge-guide-status').textContent).toMatch(/connected/);
  });
});
