import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getAgentTools, agentEvents, useAgentStore } from '@/agent';
import { resetAgentTestState } from '@/agent/testHelpers';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { commitAiWrite } from '@/agent/commit';
import { clearHistory } from '@/store/history';
import { AgentToolRegistrar } from './AgentToolRegistrar';
import { AiPanel } from './AiPanel';
import { AiStatusPill } from './AiStatusPill';
import { AiToolbarButton } from './AiToolbarButton';
import { hasAiConsent, useAiPanelStore } from './useAiPanelStore';
import { PRO, installModelContext, removeModelContext, setSignedIn } from './testUtils';

const sub = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: sub.current }) }));
vi.mock('react-secure-storage', () => ({ default: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }));

const rename = (n: string) =>
  (useProjectStore.getState() as unknown as { setProjectName: (n: string) => void }).setProjectName(n);

function reset() {
  resetAgentTestState();
  useAgentStore.setState({ enabled: false });
  useAiPanelStore.setState({ open: false, tab: 'connect', followAi: true, registeredCount: 0, bridgeConnected: false });
  sub.current = PRO;
  setSignedIn(true);
  localStorage.clear();
}

beforeEach(reset);
afterEach(() => {
  cleanup();
  removeModelContext();
});

describe('AgentToolRegistrar', () => {
  it('registers every tool only when signed in + Pro + enabled, and unregisters on disable', () => {
    const mc = installModelContext();
    render(<AgentToolRegistrar />);
    expect(mc.registerTool).not.toHaveBeenCalled();

    act(() => useAgentStore.getState().setEnabled(true));
    expect(mc.registerTool).toHaveBeenCalledTimes(getAgentTools().length);
    expect(useAiPanelStore.getState().registeredCount).toBe(getAgentTools().length);
    expect(mc.aborts.every((s) => !s.aborted)).toBe(true);

    act(() => useAgentStore.getState().setEnabled(false));
    expect(mc.aborts.every((s) => s.aborted)).toBe(true);
    expect(useAiPanelStore.getState().registeredCount).toBe(0);
  });

  it('does not register for signed-out or non-Pro users, and switches the runner off', () => {
    const mc = installModelContext();
    sub.current = null;
    useAgentStore.setState({ enabled: true });
    render(<AgentToolRegistrar />);
    expect(mc.registerTool).not.toHaveBeenCalled();
    expect(useAgentStore.getState().enabled).toBe(false);

    cleanup();
    sub.current = PRO;
    setSignedIn(false);
    useAgentStore.setState({ enabled: true });
    render(<AgentToolRegistrar />);
    expect(mc.registerTool).not.toHaveBeenCalled();
  });

  it('unregisters on unmount', () => {
    const mc = installModelContext();
    useAgentStore.setState({ enabled: true });
    const { unmount } = render(<AgentToolRegistrar />);
    expect(mc.aborts.length).toBeGreaterThan(0);
    unmount();
    expect(mc.aborts.every((s) => s.aborted)).toBe(true);
  });

  it('does nothing in an unsupported browser', () => {
    useAgentStore.setState({ enabled: true });
    render(<AgentToolRegistrar />);
    expect(useAiPanelStore.getState().registeredCount).toBe(0);
  });

  it('syncs export limits from the subscription', () => {
    render(<AgentToolRegistrar />);
    expect(useAgentStore.getState().exportLimits).not.toBeNull();
  });
});

describe('Connect tab', () => {
  it('explains unsupported browsers plainly and points to the bridge', () => {
    useAiPanelStore.setState({ open: true });
    render(<AiPanel />);
    expect(screen.getByRole('switch', { name: 'Allow AI agents to control this project' })).not.toBeDisabled();
    act(() => useAgentStore.getState().setEnabled(true));
    expect(screen.getByTestId('ai-status').textContent).toMatch(/does not support WebMCP.*Gemini in Chrome.*bridge/);
  });

  it('reports tools available through the bridge without WebMCP', () => {
    useAiPanelStore.setState({ open: true, bridgeConnected: true });
    useAgentStore.setState({ enabled: true });
    render(<AiPanel />);
    expect(screen.getByTestId('ai-status').textContent).toContain('through the local bridge');
  });

  it('asks for confirmation the first time, then remembers it', () => {
    installModelContext();
    useAiPanelStore.setState({ open: true });
    render(<AiPanel />);
    const toggle = screen.getByRole('switch', { name: 'Allow AI agents to control this project' });

    fireEvent.click(toggle);
    expect(screen.getByText(/experimental feature/i)).toBeInTheDocument();
    expect(useAgentStore.getState().enabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useAgentStore.getState().enabled).toBe(false);

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(useAgentStore.getState().enabled).toBe(true);

    fireEvent.click(toggle); // off
    expect(useAgentStore.getState().enabled).toBe(false);
    fireEvent.click(toggle); // on again: no dialog
    expect(useAgentStore.getState().enabled).toBe(true);
  });

  it('shows the tool count when registered', () => {
    installModelContext();
    useAgentStore.setState({ enabled: true });
    useAiPanelStore.setState({ open: true });
    render(<><AgentToolRegistrar /><AiPanel /></>);
    expect(screen.getByTestId('ai-status').textContent).toContain(`${getAgentTools().length} tools available`);
  });
});

describe('Gating in the panel', () => {
  const toggle = () => screen.getByRole('switch', { name: 'Allow AI agents to control this project' });

  it('explains the feature to non-Pro users, then sends them to upgrade instead of enabling', () => {
    sub.current = null;
    useAiPanelStore.setState({ open: true });
    render(<AiPanel />);
    expect(screen.getByTestId('ai-pro-note')).toBeInTheDocument();
    fireEvent.click(toggle());
    expect(screen.getByText(/experimental feature/)).toBeInTheDocument();
    expect(screen.getByText(/small lil-mappo bridge app/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See Wanderer plan' }));
    expect(useAuthStore.getState().showUpgradeModal).toBe(true);
    expect(useAgentStore.getState().enabled).toBe(false);
    expect(hasAiConsent()).toBe(false);
  });

  it('sends signed-out users to sign in', () => {
    act(() => setSignedIn(false));
    useAiPanelStore.setState({ open: true });
    render(<AiPanel />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(useAuthStore.getState().showAuthModal).toBe(true);
    expect(useAgentStore.getState().enabled).toBe(false);
  });
});

describe('Toolbar button', () => {
  it('opens the panel for everyone and shows the PRO badge to non-Pro users', () => {
    sub.current = null;
    render(<AiToolbarButton />);
    expect(screen.getByText('PRO')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('AI (Experimental)'));
    expect(useAiPanelStore.getState().open).toBe(true);
    expect(useAuthStore.getState().showUpgradeModal).toBe(false);
  });

  it('toggles the panel for Pro users', () => {
    render(<AiToolbarButton />);
    expect(screen.queryByText('PRO')).toBeNull();
    fireEvent.click(screen.getByTitle('AI (Experimental)'));
    expect(useAiPanelStore.getState().open).toBe(true);
    fireEvent.click(screen.getByTitle('AI (Experimental)'));
    expect(useAiPanelStore.getState().open).toBe(false);
  });
});

describe('Activity tab', () => {
  const emit = (id: string, phase: 'started' | 'succeeded' | 'failed', extra = {}) =>
    agentEvents.emit({ id, tool: 'add_callout', phase, input: {}, at: Date.now(), ...extra });

  it('renders calls newest first and selects the affected item on click', () => {
    const addCallout = getAgentTools().find((t) => t.name === 'add_callout')!;
    useProjectStore.setState({ isInspectorOpen: false });
    emit('c1', 'started');
    emit('c1', 'succeeded', { summary: 'Added callout', affectedItemIds: ['item-1'] });
    emit('c2', 'started');
    emit('c2', 'failed', { error: 'boom' });
    useProjectStore.setState({
      items: { ...useProjectStore.getState().items, 'item-1': { kind: 'callout', id: 'item-1' } as never },
    });
    useAiPanelStore.setState({ open: true, tab: 'activity' });
    render(<AiPanel />);

    const rows = screen.getByTestId('ai-feed').querySelectorAll('li');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('boom');
    expect(rows[1].textContent).toContain('Added callout');
    expect(rows[1].textContent).toContain(addCallout.title);

    fireEvent.click(screen.getByTestId('ai-row-c1'));
    expect(useProjectStore.getState().selectedItemId).toBe('item-1');
    expect(useProjectStore.getState().isInspectorOpen).toBe(true);
  });

  it('has an empty state and clears the feed', () => {
    useAiPanelStore.setState({ open: true, tab: 'activity' });
    render(<AiPanel />);
    expect(screen.getByText('No AI activity yet.')).toBeInTheDocument();
    act(() => emit('c1', 'succeeded', { summary: 's' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear feed' }));
    expect(agentEvents.getLog()).toHaveLength(0);
  });

  it('enables Undo last AI change only when the top entry is AI, repeatable', () => {
    clearHistory();
    useAiPanelStore.setState({ open: true, tab: 'activity' });
    render(<AiPanel />);
    const btn = () => screen.getByRole('button', { name: /Undo last AI change/ });
    expect(btn()).toBeDisabled();

    act(() => rename('user edit'));
    expect(btn()).toBeDisabled();

    act(() => commitAiWrite('AI: a', () => rename('ai 1')));
    act(() => commitAiWrite('AI: b', () => rename('ai 2')));
    expect(btn()).toBeEnabled();
    fireEvent.click(btn());
    expect(useProjectStore.getState().name).toBe('ai 1');
    expect(btn()).toBeEnabled();
    fireEvent.click(btn());
    expect(useProjectStore.getState().name).toBe('user edit');
    expect(btn()).toBeDisabled();
  });
});

describe('Status pill', () => {
  it('is hidden until tools are registered, pulses while a call runs, opens Activity', () => {
    render(<AiStatusPill />);
    expect(screen.queryByTestId('ai-status-pill')).toBeNull();

    act(() => useAiPanelStore.setState({ registeredCount: 5 }));
    expect(screen.getByTestId('ai-status-pill').textContent).toContain('AI connected');
    expect(screen.getByTestId('ai-status-dot').dataset.running).toBe('false');

    act(() => agentEvents.emit({ id: 'x', tool: 'get_project', phase: 'started', input: {}, at: Date.now() }));
    expect(screen.getByTestId('ai-status-dot').dataset.running).toBe('true');
    expect(screen.getByTestId('ai-status-pill').textContent).toContain('1 call');

    fireEvent.click(screen.getByTestId('ai-status-pill'));
    expect(useAiPanelStore.getState()).toMatchObject({ open: true, tab: 'activity' });
  });
});
