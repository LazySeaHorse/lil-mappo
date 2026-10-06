import { describe, expect, it } from 'vitest';
import { classifyExportError, importSourceOf } from './classify';

describe('classifyExportError', () => {
  it.each([
    [new Error('WebCodecs (VideoEncoder) is not available in this browser.'), 'unsupported'],
    [new Error('H.264 encoding failed on this device (codec: avc1)'), 'encoder'],
    [new Error('VideoEncoder error: x'), 'encoder'],
    [new DOMException('x', 'QuotaExceededError'), 'oom'],
    [new Error('Browser storage ran out of space while writing the video.'), 'oom'],
    [new Error('Map runtime not available'), 'capture'],
    [new Error('???'), 'other'],
    ['weird', 'other'],
  ])('classifies %s as %s', (err, expected) => {
    expect(classifyExportError(err)).toBe(expected);
  });
});

describe('importSourceOf', () => {
  it('uses only the extension', () => {
    expect(importSourceOf('Holiday 2025.GPX')).toBe('import_gpx');
    expect(importSourceOf('a.kml')).toBe('import_kml');
    expect(importSourceOf('a.json')).toBe('import_geojson');
    expect(importSourceOf('noext')).toBe('import_geojson');
  });
});
