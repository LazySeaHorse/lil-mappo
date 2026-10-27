import { describe, expect, it } from 'vitest';
import { importRouteFile } from './fileImport';
import { MAX_ROUTE_FILE_BYTES, decodeRouteText, detectRouteFormat, routeNameOf } from './routeFileFormats';

const gpx = (points: [number, number][], extra = '') =>
  `<?xml version="1.0"?><gpx version="1.1"><trk><name>Morning run</name><trkseg>${points
    .map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"><ele>10</ele><time>2025-01-01T00:00:00Z</time>${extra}</trkpt>`)
    .join('')}</trkseg></trk></gpx>`;

const file = (content: string | Uint8Array, name: string) =>
  new File([content instanceof Uint8Array ? new Uint8Array(content) : content], name);

const utf16le = (text: string) => {
  const out = new Uint8Array(2 + text.length * 2);
  out.set([0xff, 0xfe]);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out;
};

describe('detectRouteFormat', () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  it('tells the formats apart by content', () => {
    expect(detectRouteFormat(enc(gpx([[1, 2]])))).toBe('gpx');
    expect(detectRouteFormat(enc('<kml xmlns="http://www.opengis.net/kml/2.2"/>'))).toBe('kml');
    expect(detectRouteFormat(enc('<?xml version="1.0"?><TrainingCenterDatabase/>'))).toBe('tcx');
    expect(detectRouteFormat(enc('  {"type":"FeatureCollection"}'))).toBe('geojson');
    expect(detectRouteFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe('zip');
    expect(detectRouteFormat(new Uint8Array([0x1f, 0x8b, 8, 0]))).toBe('gzip');
    expect(detectRouteFormat(new Uint8Array([14, 0x10, 0, 0, 0, 0, 0, 0, 0x2e, 0x46, 0x49, 0x54, 0, 0]))).toBe('fit');
  });

  it('returns null for anything else', () => {
    expect(detectRouteFormat(enc('hello'))).toBeNull();
    expect(detectRouteFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(detectRouteFormat(new Uint8Array())).toBeNull();
  });

  it('reads through a UTF-8 or UTF-16 byte-order mark', () => {
    expect(detectRouteFormat(new Uint8Array([0xef, 0xbb, 0xbf, ...enc(gpx([[1, 2]]))]))).toBe('gpx');
    expect(detectRouteFormat(utf16le(gpx([[1, 2]])))).toBe('gpx');
    expect(decodeRouteText(utf16le('<gpx/>'))).toBe('<gpx/>');
  });
});

describe('routeNameOf', () => {
  it('drops route extensions, including behind .gz', () => {
    expect(routeNameOf('Morning run.gpx')).toBe('Morning run');
    expect(routeNameOf('12345.fit.gz')).toBe('12345');
    expect(routeNameOf('trip.KMZ')).toBe('trip');
    expect(routeNameOf('notes.txt')).toBe('notes.txt');
  });
});

describe('importRouteFile', () => {
  it('picks the format from the bytes, whatever the extension says', async () => {
    const imported = await importRouteFile(file(gpx([[46, 8], [47, 9]]), 'activity_123.dat'));
    expect(imported.format).toBe('gpx');
    expect(imported.name).toBe('activity_123.dat');
  });

  it('reads UTF-16 and byte-order-marked GPX', async () => {
    for (const bytes of [utf16le(gpx([[46, 8], [47, 9]])), new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(gpx([[46, 8], [47, 9]]))])]) {
      const imported = await importRouteFile(file(bytes, 'bom.gpx'));
      expect(imported.geojson.features[0].geometry).toMatchObject({ type: 'LineString' });
    }
  });

  it('keeps geometry only: per-point times and sensor data are not stored', async () => {
    const imported = await importRouteFile(
      file(gpx([[46, 8], [47, 9]], '<extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx="x"><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>'), 'ride.gpx'),
    );
    for (const f of imported.geojson.features) expect(f.properties).toEqual({});
    expect(JSON.stringify(imported.geojson)).not.toContain('150');
  });

  it('refuses a file with no line to draw', async () => {
    const waypointsOnly = '<gpx version="1.1"><wpt lat="1" lon="2"><name>Cafe</name></wpt></gpx>';
    await expect(importRouteFile(file(waypointsOnly, 'w.gpx'))).rejects.toMatchObject({ code: 'noTrack', message: expect.stringContaining('No GPS track') });
  });

  it('says why a file of an unknown kind is refused', async () => {
    await expect(importRouteFile(file('just some notes', 'notes.txt'))).rejects.toMatchObject({ code: 'type' });
    await expect(importRouteFile(file('', 'e.gpx'))).rejects.toMatchObject({ code: 'empty' });
  });

  it('refuses a file over the size cap before reading it', async () => {
    const big = file('x', 'big.gpx');
    Object.defineProperty(big, 'size', { value: MAX_ROUTE_FILE_BYTES + 1 });
    await expect(importRouteFile(big)).rejects.toMatchObject({ code: 'size' });
  });
});
