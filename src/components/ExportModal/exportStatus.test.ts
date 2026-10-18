import { describe, expect, it } from 'vitest';
import { exportHeadline, exportMood, localExportWarning } from './exportStatus';

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

describe('exportHeadline', () => {
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

  it('gets tangled in film when the export failed or cannot run here', () => {
    expect(exportMood({ isExporting: false, done: false, failed: true, unsupported: false })).toBe('tangled');
    expect(exportMood({ isExporting: false, done: false, failed: false, unsupported: true })).toBe('tangled');
  });
});
