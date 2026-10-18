import { describe, expect, it } from 'vitest';
import { exportHeadline, exportMood, localExportWarning, wandererReason } from './exportStatus';

describe('localExportWarning', () => {
  it('says nothing when the browser can export, or while it is still being checked', () => {
    expect(localExportWarning({ status: 'ready', codec: 'avc1.640028' }, 1920, 1080, 30)).toBeNull();
    expect(localExportWarning(null, 1920, 1080, 30)).toBeNull();
  });

  it('names the size and frame rate the browser says it cannot encode, and how to fix it', () => {
    const text = localExportWarning({ status: 'limited' }, 3840, 2160, 60);
    expect(text).toContain('3840 × 2160, 60 FPS');
    expect(text).toMatch(/lower resolution or 30 FPS/);
  });

  it('explains that this browser cannot make MP4 files at all, and what to use instead', () => {
    const text = localExportWarning({ status: 'unsupported' }, 1920, 1080, 30);
    expect(text).toMatch(/can't make MP4 files/);
    expect(text).toMatch(/Chrome or Edge/);
  });
});

describe('wandererReason', () => {
  it('names what was picked that needs Wanderer', () => {
    expect(wandererReason(['resolution'], '2160p', 30)).toBe('4K 2160p comes with the Wanderer plan.');
    expect(wandererReason(['fps'], '720p', 30)).toBe('60 FPS comes with the Wanderer plan.');
    expect(wandererReason(['duration'], '720p', 30)).toBe('Exports past 30 seconds come with the Wanderer plan.');
    expect(wandererReason(['resolution', 'fps', 'duration'], '1080p', 30)).toBe(
      'FHD 1080p, 60 FPS and exports past 30 seconds come with the Wanderer plan.',
    );
  });

  it('is null when nothing needs it', () => {
    expect(wandererReason([], '720p', 30)).toBeNull();
  });
});

describe('exportHeadline', () => {
  it('says what needs Wanderer when a Pro setting is picked', () => {
    expect(exportHeadline({ isExporting: false, done: false, wanderer: '60 FPS comes with the Wanderer plan.' })).toBe(
      '60 FPS comes with the Wanderer plan.',
    );
  });

  it('asks the user to keep the tab open while exporting', () => {
    expect(exportHeadline({ isExporting: true, done: false })).toMatch(/Keep this tab open/);
  });

  it('confirms the download once the export is done', () => {
    expect(exportHeadline({ isExporting: false, done: true })).toBe('Export complete. The browser downloaded the file.');
  });

  it('shows what went wrong when the export failed, in place of the usual line', () => {
    expect(exportHeadline({ isExporting: false, done: false, error: 'The GPU ran out of memory.' })).toBe('The GPU ran out of memory.');
    expect(exportHeadline({ isExporting: true, done: false, error: 'stale' })).toMatch(/Keep this tab open/);
  });

  it('describes the form otherwise', () => {
    expect(exportHeadline({ isExporting: false, done: false })).toBe('Set the video format and export range.');
  });
});

describe('exportMood', () => {
  it('holds the camera when ready, spins a reel while exporting and cheers when done', () => {
    expect(exportMood({ isExporting: false, done: false, failed: false, unsupported: false })).toBe('camera');
    expect(exportMood({ isExporting: true, done: false, failed: false, unsupported: false })).toBe('reel');
    expect(exportMood({ isExporting: false, done: true, failed: false, unsupported: false })).toBe('cheer');
  });

  it('holds up the key when a Pro setting is picked', () => {
    expect(exportMood({ isExporting: false, done: false, failed: false, unsupported: false, needsWanderer: true })).toBe('key');
  });

  it('gets tangled in film when the export failed or cannot run here', () => {
    expect(exportMood({ isExporting: false, done: false, failed: true, unsupported: false })).toBe('tangled');
    expect(exportMood({ isExporting: false, done: false, failed: false, unsupported: true })).toBe('tangled');
  });
});
