import { describe, expect, it } from 'vitest';
import { importRouteFiles } from './fileImport';
import type { ImportedRoute } from './fileImport';
import { MAX_ROUTE_FILE_BYTES, ROUTE_FILE_ACCEPT, decodeRouteText, detectRouteFormat, routeNameOf } from './routeFileFormats';

const importOne = async (f: File): Promise<ImportedRoute> => (await importRouteFiles(f))[0];

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

describe('importRouteFiles', () => {
  it('picks the format from the bytes, whatever the extension says', async () => {
    const [imported] = await importRouteFiles(file(gpx([[46, 8], [47, 9]]), 'activity_123.dat'));
    expect(imported.format).toBe('gpx');
    expect(imported.name).toBe('activity_123.dat');
  });

  it('reads UTF-16 and byte-order-marked GPX', async () => {
    for (const bytes of [utf16le(gpx([[46, 8], [47, 9]])), new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(gpx([[46, 8], [47, 9]]))])]) {
      const [imported] = await importRouteFiles(file(bytes, 'bom.gpx'));
      expect(imported.geojson.features[0].geometry).toMatchObject({ type: 'LineString' });
    }
  });

  it('keeps geometry only: per-point times and sensor data are not stored', async () => {
    const imported = await importOne(
      file(gpx([[46, 8], [47, 9]], '<extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx="x"><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>'), 'ride.gpx'),
    );
    for (const f of imported.geojson.features) expect(f.properties).toEqual({});
    expect(JSON.stringify(imported.geojson)).not.toContain('150');
  });

  it('refuses a file with no line to draw', async () => {
    const waypointsOnly = '<gpx version="1.1"><wpt lat="1" lon="2"><name>Cafe</name></wpt></gpx>';
    await expect(importRouteFiles(file(waypointsOnly, 'w.gpx'))).rejects.toMatchObject({ code: 'noTrack', message: expect.stringContaining('No GPS track') });
  });

  it('says why a file of an unknown kind is refused', async () => {
    await expect(importRouteFiles(file('just some notes', 'notes.txt'))).rejects.toMatchObject({ code: 'type' });
    await expect(importRouteFiles(file('', 'e.gpx'))).rejects.toMatchObject({ code: 'empty' });
  });

  it('refuses a file over the size cap before reading it', async () => {
    const big = file('x', 'big.gpx');
    Object.defineProperty(big, 'size', { value: MAX_ROUTE_FILE_BYTES + 1 });
    await expect(importRouteFiles(big)).rejects.toMatchObject({ code: 'size' });
  });
});

describe('TCX import', () => {
  const trackpoint = (lat: number, lon: number) =>
    `<Trackpoint><Time>2025-01-01T00:00:00Z</Time><Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>${lon}</LongitudeDegrees></Position><HeartRateBpm><Value>150</Value></HeartRateBpm></Trackpoint>`;
  const tcx = (body: string) =>
    `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">${body}</TrainingCenterDatabase>`;
  const lap = (...tracks: string[][]) => `<Lap>${tracks.map((t) => `<Track>${t.join('')}</Track>`).join('')}</Lap>`;

  it('joins laps into one line', async () => {
    const xml = tcx(`<Activities><Activity Sport="Running">${[
      lap([trackpoint(46, 8), trackpoint(46.1, 8.1)]),
      lap([trackpoint(46.2, 8.2), trackpoint(46.3, 8.3)]),
      lap([trackpoint(46.4, 8.4), trackpoint(46.5, 8.5)]),
    ].join('')}</Activity></Activities>`);
    const [imported] = await importRouteFiles(file(xml, 'run.tcx'));
    expect(imported.format).toBe('tcx');
    expect(imported.geojson.features).toHaveLength(1);
    expect(imported.geojson.features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [[8, 46], [8.1, 46.1], [8.2, 46.2], [8.3, 46.3], [8.4, 46.4], [8.5, 46.5]],
    });
    expect(JSON.stringify(imported.geojson)).not.toContain('150');
  });

  it('keeps a pause inside a lap as a gap', async () => {
    const xml = tcx(`<Activities><Activity>${lap([trackpoint(1, 1), trackpoint(2, 2)], [trackpoint(3, 3), trackpoint(4, 4)])}</Activity></Activities>`);
    const [imported] = await importRouteFiles(file(xml, 'paused.tcx'));
    expect(imported.geojson.features[0].geometry.type).toBe('MultiLineString');
  });

  it('reads a course and ignores its course points', async () => {
    const xml = tcx(`<Courses><Course><Track>${trackpoint(46, 8)}${trackpoint(46.1, 8.1)}</Track><CoursePoint><Name>Turn</Name><Position><LatitudeDegrees>46</LatitudeDegrees><LongitudeDegrees>8</LongitudeDegrees></Position></CoursePoint></Course></Courses>`);
    const [imported] = await importRouteFiles(file(xml, 'course.tcx'));
    expect(imported.geojson.features).toHaveLength(1);
    expect(imported.geojson.features[0].geometry.type).toBe('LineString');
  });

  it('refuses an indoor activity whose trackpoints have no position', async () => {
    const xml = tcx('<Activities><Activity Sport="Biking"><Lap><Track><Trackpoint><Time>2025-01-01T00:00:00Z</Time><HeartRateBpm><Value>120</Value></HeartRateBpm></Trackpoint></Track></Lap></Activity></Activities>');
    await expect(importRouteFiles(file(xml, 'trainer.tcx'))).rejects.toMatchObject({ code: 'noTrack' });
  });
});

describe('ROUTE_FILE_ACCEPT', () => {
  it('lists the extensions and the types phones report for them', () => {
    const accept = ROUTE_FILE_ACCEPT.split(',');
    for (const ext of ['.gpx', '.kml', '.kmz', '.tcx', '.fit', '.geojson', '.json', '.zip', '.gz']) expect(accept).toContain(ext);
    expect(accept).toContain('application/octet-stream');
  });
});
