import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportModalFooter } from './components/ExportModalFooter';
import { ExportStatusAlerts } from './components/ExportStatusAlerts';
import type { ExportLimits } from '@/lib/cloudAccess';

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
    it('renders "Export locally" and responds to click when idle and ready', () => {
      const onExport = vi.fn();
      const onCancel = vi.fn();

      render(
        <ExportModalFooter
          isExporting={false}
          cloudSubmitted={false}
          progress={0}
          localExportCapability={{ status: 'ready', codec: 'avc1.640028' }}
          onExport={onExport}
          onCancel={onCancel}
        />
      );

      const exportBtn = screen.getByRole('button', { name: /Export locally/i });
      expect(exportBtn).toBeDefined();
      expect(exportBtn.hasAttribute('disabled')).toBe(false);

      fireEvent.click(exportBtn);
      expect(onExport).toHaveBeenCalledTimes(1);
    });

    it('renders "Cancel" button during active export and responds to click', () => {
      const onExport = vi.fn();
      const onCancel = vi.fn();

      render(
        <ExportModalFooter
          isExporting={true}
          cloudSubmitted={false}
          progress={45}
          localExportCapability={{ status: 'ready', codec: 'avc1.640028' }}
          onExport={onExport}
          onCancel={onCancel}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
      expect(cancelBtn).toBeDefined();

      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('shows Cloud render as an enabled split control beside Export, with no "Not available yet" text', () => {
      render(
        <ExportModalFooter
          isExporting={false}
          cloudSubmitted={false}
          progress={0}
          localExportCapability={{ status: 'ready' } as never}
          onExport={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      const cloud = screen.getByRole('button', { name: 'Cloud render, not built yet' });
      const exportBtn = screen.getByRole('button', { name: /Export locally/i });
      expect(cloud.hasAttribute('disabled')).toBe(false);
      expect(cloud.parentElement).toBe(exportBtn.parentElement);
      expect(cloud.className).toContain('h-11');
      expect(exportBtn.className).toContain('h-11');
      expect(screen.queryByText(/Not available yet/)).toBeNull();
      expect(screen.queryByRole('button', { name: /I'd like this/ })).toBeNull();
    });

    it('disables export button when local export is unsupported', () => {
      render(
        <ExportModalFooter
          isExporting={false}
          cloudSubmitted={false}
          progress={0}
          localExportCapability={{ status: 'unsupported' }}
          onExport={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const exportBtn = screen.getByRole('button', { name: /Export locally/i });
      expect(exportBtn.hasAttribute('disabled')).toBe(true);
    });
  });

  describe('ExportStatusAlerts', () => {
    it('renders free plan limits and upgrade prompt for limited users', () => {
      const onOpenUpgrade = vi.fn();

      render(
        <ExportStatusAlerts
          limits={freeLimits}
          isExporting={false}
          exportDuration={15}
          effectiveWidth={1280}
          effectiveHeight={720}
          effectiveFps={30}
          totalFrames={450}
          localExportCapability={{ status: 'ready', codec: 'avc1.640028' }}
          phase="capture"
          progress={0}
          error={null}
          cloudSubmitted={false}
          onOpenUpgrade={onOpenUpgrade}
        />
      );

      expect(screen.getByText(/Free plan limit:/)).toBeDefined();
      expect(screen.getAllByText(/1280 × 720/).length).toBeGreaterThan(0);
      expect(screen.getByText(/450/)).toBeDefined();

      const upgradeBtn = screen.getByText(/higher limits/);
      fireEvent.click(upgradeBtn);
      expect(onOpenUpgrade).toHaveBeenCalledTimes(1);
    });

    it('renders keep tab open warning and progress bar during export', () => {
      render(
        <ExportStatusAlerts
          limits={proLimits}
          isExporting={true}
          exportDuration={10}
          effectiveWidth={1920}
          effectiveHeight={1080}
          effectiveFps={60}
          totalFrames={600}
          localExportCapability={{ status: 'ready', codec: 'avc1.640028' }}
          phase="capture"
          progress={65}
          error={null}
          cloudSubmitted={false}
          onOpenUpgrade={vi.fn()}
        />
      );

      expect(screen.getByText('Keep this tab open')).toBeDefined();
      expect(screen.getByText('65%')).toBeDefined();
      expect(screen.getByText('Exporting frames')).toBeDefined();
    });

    it('renders error alert when error message is passed', () => {
      render(
        <ExportStatusAlerts
          limits={proLimits}
          isExporting={false}
          exportDuration={10}
          effectiveWidth={1920}
          effectiveHeight={1080}
          effectiveFps={60}
          totalFrames={600}
          localExportCapability={{ status: 'ready', codec: 'avc1.640028' }}
          phase="capture"
          progress={0}
          error="Out of WebCodecs memory"
          cloudSubmitted={false}
          onOpenUpgrade={vi.fn()}
        />
      );

      expect(screen.getByText('Out of WebCodecs memory')).toBeDefined();
    });
  });
});
