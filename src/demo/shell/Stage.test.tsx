import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { Stage } from './Stage';
import { AppDevice } from './AppDevice';
import { ClaudeCode } from './ClaudeCode';
import { stageLayout } from './layout';
import { INITIAL_TRANSCRIPT } from './transcript';
import { Widget } from './Widget';
import { viewStyle } from './zoom';

afterEach(cleanup);

const box = { left: 0, top: 0, width: 800, height: 450 };

describe('Stage zoom layer', () => {
  it('moves the wallpaper and windows with the camera, and leaves the overlay alone', () => {
    const { container } = render(
      <Stage box={box} zoom={viewStyle({ scale: 1.5, x: -100, y: -40 }, { speed: 1, instant: false })} overlay={<div data-testid="shield" />}>
        <iframe title="app" />
      </Stage>,
    );
    const layer = container.querySelector('.ds-zoom') as HTMLElement;
    expect(layer.style.transform).toBe('translate(-100.00px, -40.00px) scale(1.5000)');
    expect(layer.style.transitionDuration).toBe('700ms');
    expect(layer.querySelector('.ds-wallpaper')).not.toBeNull();
    expect(layer.querySelector('iframe')).not.toBeNull();
    expect(layer.contains(screen.getByTestId('shield'))).toBe(false);
    expect(layer.style.willChange).toBe('');
  });

  it('keeps the same iframe node while the camera moves', () => {
    const view = (scale: number) => viewStyle({ scale, x: -50, y: -20 }, { speed: 1, instant: false });
    const { container, rerender } = render(<Stage box={box} zoom={view(1.2)}><iframe title="app" /></Stage>);
    const frame = container.querySelector('iframe');
    rerender(<Stage box={box} zoom={view(1.8)}><iframe title="app" /></Stage>);
    rerender(<Stage box={box} zoom={viewStyle({ scale: 1, x: 0, y: 0 }, { speed: 1, instant: true })}><iframe title="app" /></Stage>);
    expect(container.querySelector('iframe')).toBe(frame);
    expect((container.querySelector('.ds-zoom') as HTMLElement).style.transform).toBe('none');
  });
});

describe('Widget auto zoom controls', () => {
  const props = () => ({
    frameReady: true,
    load: { kind: 'none' as const },
    missingModels: [],
    settings: DEFAULT_SETTINGS,
    runState: 'empty' as const,
    progress: null,
    countingDown: false,
    shortcut: '⌘.',
    onOpenFile: vi.fn(),
    onRelink: vi.fn(),
    onSettings: vi.fn(),
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onReset: vi.fn(),
    onClose: vi.fn(),
  });

  it('toggles auto zoom and sets the max zoom', () => {
    const p = props();
    render(<Widget {...p} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto zoom' }));
    expect(p.onSettings).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, autoZoom: false });
    fireEvent.change(screen.getByRole('slider', { name: /Max zoom/ }), { target: { value: '2.2' } });
    expect(p.onSettings).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, maxZoom: 2.2 });
    expect(screen.getByText('1.8×')).toBeTruthy();
  });

  it('disables the slider while auto zoom is off', () => {
    render(<Widget {...props()} settings={{ ...DEFAULT_SETTINGS, autoZoom: false }} />);
    expect(screen.getByRole('slider', { name: /Max zoom/ })).toBeDisabled();
  });
});

describe('Widget full screen and split controls', () => {
  const props = () => ({
    frameReady: true,
    load: { kind: 'none' as const },
    missingModels: [],
    settings: DEFAULT_SETTINGS,
    runState: 'empty' as const,
    progress: null,
    countingDown: false,
    shortcut: '⌘.',
    onOpenFile: vi.fn(),
    onRelink: vi.fn(),
    onSettings: vi.fn(),
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onReset: vi.fn(),
    onClose: vi.fn(),
  });

  it('toggles full screen', () => {
    const p = props();
    render(<Widget {...p} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Full screen/ }));
    expect(p.onSettings).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, fullScreen: true });
  });

  it('picks the quarter or the third for Claude, the quarter being on by default', () => {
    const p = props();
    render(<Widget {...p} />);
    expect(screen.getByRole('radio', { name: '¼' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '⅓' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('radio', { name: '⅓' }));
    expect(p.onSettings).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, terminalShare: 1 / 3 });
  });
});

describe('Full screen chrome', () => {
  const iframeRef = { current: null };

  it('keeps the browser toolbar and URL but drops the traffic lights', () => {
    const full = render(<AppDevice layout={stageLayout(1600, 900, 16 / 9, true, { fullScreen: true })} iframeRef={iframeRef} src="/x" />).container;
    expect(full.querySelector('.ss-window__lights')).toBeNull();
    expect(full.querySelector('.ss-window__bar')).not.toBeNull();
    expect(full.textContent).toContain('app.lilmappo.tech');
    cleanup();
    const floating = render(<AppDevice layout={stageLayout(1600, 900, 16 / 9, true)} iframeRef={iframeRef} src="/x" />).container;
    expect(floating.querySelector('.ss-window__lights')).not.toBeNull();
  });

  it('leaves the terminal without a bar in full screen', () => {
    const l = stageLayout(1600, 900, 16 / 9, true, { fullScreen: true });
    const full = render(<ClaudeCode box={l.terminal} open portrait={false} fullScreen transcript={INITIAL_TRANSCRIPT} fontSize={12} />).container;
    expect(full.querySelector('.ss-window__bar')).toBeNull();
    cleanup();
    const floating = render(<ClaudeCode box={l.terminal} open portrait={false} transcript={INITIAL_TRANSCRIPT} fontSize={12} />).container;
    expect(floating.querySelector('.ss-window__bar')).not.toBeNull();
  });
});
