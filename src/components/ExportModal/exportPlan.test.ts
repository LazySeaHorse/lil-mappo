import type { ExportLimits } from '@/lib/cloudAccess';
import type { RenderConfig } from '@/types/render';
import { resolveExportPlan, wandererNeeds } from './exportPlan';

const requestedConfig: RenderConfig = {
  resolution: [3840, 2160],
  fps: 60,
  aspectRatio: '16:9',
  exportResolution: '2160p',
  isVertical: false,
};

describe('resolveExportPlan', () => {
  it('clamps all settings to the active tier in one snapshot', () => {
    const limits: ExportLimits = {
      maxDuration: 30,
      maxResolution: '720p',
      maxFps: 30,
      limited: true,
    };

    const plan = resolveExportPlan(
      requestedConfig,
      { startTime: 4, endTime: 90 },
      limits,
    );

    expect(plan).toMatchObject({
      startTime: 4,
      endTime: 30,
      renderConfig: {
        exportResolution: '720p',
        fps: 30,
        resolution: [1280, 720],
      },
    });
  });

  it('preserves settings that are within the active tier', () => {
    const limits: ExportLimits = {
      maxDuration: Infinity,
      maxResolution: '2160p',
      maxFps: 60,
      limited: false,
    };

    const plan = resolveExportPlan(
      requestedConfig,
      { startTime: 2, endTime: 45 },
      limits,
    );

    expect(plan.renderConfig.exportResolution).toBe('2160p');
    expect(plan.renderConfig.fps).toBe(60);
    expect(plan.renderConfig.resolution).toEqual([3840, 2160]);
    expect(plan.endTime).toBe(45);
  });
});

describe('wandererNeeds', () => {
  const free: ExportLimits = { maxDuration: 30, maxResolution: '720p', maxFps: 30, limited: true };
  const paid: ExportLimits = { maxDuration: 300, maxResolution: '2160p', maxFps: 60, limited: false };
  const at = (exportResolution: RenderConfig['exportResolution'], fps: 30 | 60): RenderConfig => ({ ...requestedConfig, exportResolution, fps });

  it('lists each picked setting that is past the free plan', () => {
    expect(wandererNeeds(at('1080p', 30), { startTime: 0, endTime: 12 }, free)).toEqual(['resolution']);
    expect(wandererNeeds(at('720p', 60), { startTime: 0, endTime: 12 }, free)).toEqual(['fps']);
    expect(wandererNeeds(at('720p', 30), { startTime: 0, endTime: 45 }, free)).toEqual(['duration']);
    expect(wandererNeeds(at('2160p', 60), { startTime: 0, endTime: 45 }, free)).toEqual(['resolution', 'fps', 'duration']);
  });

  it('needs nothing when the picks fit the plan', () => {
    expect(wandererNeeds(at('720p', 30), { startTime: 0, endTime: 30 }, free)).toEqual([]);
    expect(wandererNeeds(at('2160p', 60), { startTime: 0, endTime: 200 }, paid)).toEqual([]);
  });
});
