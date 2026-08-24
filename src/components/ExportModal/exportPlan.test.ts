import type { ExportLimits } from '@/lib/cloudAccess';
import type { RenderConfig } from '@/types/render';
import { resolveExportPlan } from './exportPlan';

const requestedConfig: RenderConfig = {
  resolution: [3840, 2160],
  fps: 60,
  aspectRatio: '16:9',
  exportResolution: '2160p',
  isVertical: false,
  mapStyle: 'standard',
  terrainEnabled: false,
  buildingsEnabled: true,
  labelVisibility: {},
  show3dLandmarks: true,
  show3dTrees: true,
  show3dFacades: true,
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
