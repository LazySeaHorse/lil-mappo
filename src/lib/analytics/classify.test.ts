import { describe, expect, it } from 'vitest';
import { classifyExportError, classifyImportError, importFormatOf, importSourceOf } from './classify';

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
  it('maps the detected format to a route source', () => {
    expect(importSourceOf('gpx')).toBe('import_gpx');
    expect(importSourceOf('kml')).toBe('import_kml');
    expect(importSourceOf('tcx')).toBe('import_tcx');
    expect(importSourceOf('fit')).toBe('import_fit');
    expect(importSourceOf('geojson')).toBe('import_geojson');
  });
});

describe('import classification', () => {
  it('guesses the format from the extension only, looking through .gz and .kmz', () => {
    expect([
      importFormatOf('a.GPX'), importFormatOf('a.kml'), importFormatOf('a.json'), importFormatOf('a.geojson'), importFormatOf('a.zip'),
      importFormatOf('a.tcx'), importFormatOf('a.fit.gz'), importFormatOf('a.kmz'),
    ]).toEqual(['gpx', 'kml', 'geojson', 'geojson', 'unknown', 'tcx', 'fit', 'kml']);
  });

  it('maps parser errors to coarse classes without keeping the message', () => {
    expect(classifyImportError(new Error('File is empty (0 bytes)'))).toBe('empty');
    expect(classifyImportError(new Error('Invalid GPX: line 3'))).toBe('parse');
    expect(classifyImportError(new Error('Unsupported file type: .zip'))).toBe('parse');
    expect(classifyImportError(new Error('Failed to read file'))).toBe('other');
  });

  it('classifies route import errors by their code', () => {
    expect(classifyImportError(Object.assign(new Error('x'), { code: 'noTrack' }))).toBe('empty');
    expect(classifyImportError(Object.assign(new Error('x'), { code: 'type' }))).toBe('parse');
    expect(classifyImportError(Object.assign(new Error('x'), { code: 'size' }))).toBe('other');
  });
});
