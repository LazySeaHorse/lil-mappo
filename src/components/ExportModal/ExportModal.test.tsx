import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ExportModalFooter } from './components/ExportModalFooter';
import { ExportStatusAlerts } from './components/ExportStatusAlerts';
import type { ExportLimits } from '@/lib/cloudAccess';
import type { LocalExportCapability } from '@/services/localExportCapability';

describe('ExportModal Sub-components', () => {
  const freeLimits: ExportLimits = {
    limited: true,
    maxResolution: '720p',
    maxFps: 30,
    maxDuration: 30,
  };

  const proLimits: ExportLimits = {
    limited: false,
    maxResolution: '2160p',
    maxFps: 60,
    maxDuration: 300,
  };

  describe('ExportModalFooter', () => {
    const ready = { status: 'ready', codec: 'avc1.640028' } as const;
    const base = {
      isExporting: false,
      progress: 0,
      phase: 'capture' as const,
      localExportCapability: ready as LocalExportCapability,
      width: 1920,
      height: 1080,
      fps: 30,
      onExport: vi.fn(),
      onCancel: vi.fn(),
    };

    it('renders "Export locally" and responds to click when idle and ready', () => {
      const onExport = vi.fn();
      render(<ExportModalFooter {...base} onExport={onExport} />);

      const exportBtn = screen.getByRole('button', { name: /Export locally/i });
      expect(exportBtn.hasAttribute('disabled')).toBe(false);
      fireEvent.click(exportBtn);
      expect(onExport).toHaveBeenCalledTimes(1);
    });

    it('shows Cloud render as a split control beside Export, the same height, with no "Not available yet" text', () => {
      render(<ExportModalFooter {...base} />);
      const cloud = screen.getByRole('button', { name: 'Cloud render, not built yet' });
      const exportBtn = screen.getByRole('button', { name: /Export locally/i });
      expect(cloud.hasAttribute('disabled')).toBe(false);
      expect(cloud.className).toContain('h-11');
      expect(exportBtn.className).toContain('h-11');
      expect(screen.queryByText(/Not available yet/)).toBeNull();
    });

    it('turns the Export button into the progress bar while exporting', () => {
      render(<ExportModalFooter {...base} isExporting progress={65} />);
      const bar = screen.getByRole('progressbar', { name: 'Export progress' });
      expect(bar.getAttribute('aria-valuenow')).toBe('65');
      expect(screen.getAllByText('Exporting frames').length).toBeGreaterThan(0);
      expect(screen.getAllByText('65%').length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: /Export locally/i })).toBeNull();
    });

    it('says when it is still preparing map tiles', () => {
      render(<ExportModalFooter {...base} isExporting phase="prewarm" progress={20} />);
      expect(screen.getAllByText('Preparing map tiles').length).toBeGreaterThan(0);
    });

    it('folds Cloud render away while exporting so it cannot be reached', () => {
      const { container } = render(<ExportModalFooter {...base} isExporting progress={10} />);
      const cloud = container.querySelector<HTMLElement>('[data-slot="export-cloud"]');
      expect(cloud?.getAttribute('aria-hidden')).toBe('true');
      expect((cloud as HTMLElement & { inert?: boolean }).inert).toBe(true);
    });

    it('cancels from the end of the progress bar', () => {
      const onCancel = vi.fn();
      render(<ExportModalFooter {...base} isExporting progress={45} onCancel={onCancel} />);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel export' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('shows "Export complete" when an export finishes, then offers to export again', () => {
      vi.useFakeTimers();
      const { rerender } = render(<ExportModalFooter {...base} isExporting progress={90} />);
      rerender(<ExportModalFooter {...base} isExporting={false} progress={100} />);
      expect(screen.getAllByText('Export complete').length).toBeGreaterThan(0);
      act(() => vi.advanceTimersByTime(2500));
      expect(screen.getByRole('button', { name: /Export again/i })).toBeDefined();
      vi.useRealTimers();
    });

    it('turns into Get Wanderer when a Pro setting is picked, and opens the upgrade instead of exporting', () => {
      const onExport = vi.fn();
      const onUpgrade = vi.fn();
      render(
        <ExportModalFooter
          {...base}
          requiresSignIn
          wandererReason="4K 2160p comes with the Wanderer plan."
          onExport={onExport}
          onUpgrade={onUpgrade}
        />,
      );
      expect(screen.queryByRole('button', { name: /Export locally|Sign in/i })).toBeNull();
      const getWanderer = screen.getByRole('button', { name: /Get Wanderer/ });
      expect(document.getElementById(getWanderer.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
        '4K 2160p comes with the Wanderer plan.',
      );
      fireEvent.click(getWanderer);
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onExport).not.toHaveBeenCalled();
    });

    it('tells guests to sign in before they click, and still hands the click to onExport', () => {
      const onExport = vi.fn();
      render(<ExportModalFooter {...base} requiresSignIn onExport={onExport} />);
      expect(screen.queryByRole('button', { name: /Export locally/i })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Sign in to export' }));
      expect(onExport).toHaveBeenCalledTimes(1);
    });

    it('turns local export off with a warning that says why when the browser cannot make MP4 files', () => {
      const { container } = render(<ExportModalFooter {...base} localExportCapability={{ status: 'unsupported' }} />);
      const exportBtn = screen.getByRole('button', { name: /Export locally/i });
      expect(exportBtn.hasAttribute('disabled')).toBe(true);
      expect(container.querySelector('[data-slot="export-warning"]')).not.toBeNull();
      expect(document.getElementById(exportBtn.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/can't make MP4 files/);
    });

    it('keeps local export on but warns when the browser doubts these settings', () => {
      render(<ExportModalFooter {...base} width={3840} height={2160} fps={60} localExportCapability={{ status: 'limited' }} />);
      const exportBtn = screen.getByRole('button', { name: /Export locally/i });
      expect(exportBtn.hasAttribute('disabled')).toBe(false);
      expect(document.getElementById(exportBtn.getAttribute('aria-describedby') ?? '')?.textContent).toContain('3840 × 2160, 60 FPS');
    });

    it('shows no warning when the browser can export', () => {
      const { container } = render(<ExportModalFooter {...base} />);
      expect(container.querySelector('[data-slot="export-warning"]')).toBeNull();
      expect(screen.getByRole('button', { name: /Export locally/i }).hasAttribute('aria-describedby')).toBe(false);
    });
  });

  describe('ExportStatusAlerts', () => {
    it('does not nag free users with a plan note; Pro picks turn the button into Get Wanderer instead', () => {
      render(
        <ExportStatusAlerts
          exportDuration={15}
          effectiveWidth={1280}
          effectiveHeight={720}
          totalFrames={450}
        />
      );

      expect(screen.queryByText(/Free plan limit/)).toBeNull();
      expect(screen.getAllByText(/1280 × 720/).length).toBeGreaterThan(0);
      expect(screen.getByText(/450/)).toBeDefined();
    });

    it('tells guests that exporting needs an account, and that it is free', () => {
      render(
        <ExportStatusAlerts
          requiresSignIn
          exportDuration={15}
          effectiveWidth={1280}
          effectiveHeight={720}
          totalFrames={450}
        />
      );

      expect(screen.getByText('You need an account to export video. Signing in is free.')).toBeDefined();
    });

    it('does not show the sign-in note to signed-in users', () => {
      render(
        <ExportStatusAlerts
          exportDuration={15}
          effectiveWidth={1280}
          effectiveHeight={720}
          totalFrames={450}
        />
      );

      expect(screen.queryByText(/You need an account/)).toBeNull();
    });

    it('leaves progress, the tab warning and browser support to the button and header', () => {
      render(
        <ExportStatusAlerts
          exportDuration={10}
          effectiveWidth={1920}
          effectiveHeight={1080}
          totalFrames={600}
        />
      );

      expect(screen.queryByText(/Keep this tab/)).toBeNull();
      expect(screen.queryByText(/Exporting frames/)).toBeNull();
      expect(screen.queryByText(/Local export is available/)).toBeNull();
      expect(screen.queryByText(/Free plan limit/)).toBeNull();
    });
  });
});
