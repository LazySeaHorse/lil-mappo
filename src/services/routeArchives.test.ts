import { describe, expect, it } from 'vitest';
import { gzipSync, strToU8, zipSync } from 'fflate';
import { importRouteFiles } from './fileImport';
import { ROUTE_ARCHIVE_LIMITS } from './routeArchives';

const gpx = (n = 3, lat = 46) =>
  `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${Array.from({ length: n }, (_, i) => `<trkpt lat="${lat + i / 100}" lon="${8 + i / 100}"/>`).join('')}</trkseg></trk></gpx>`;
const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><LineString><coordinates>8,46,0 9,47,0</coordinates></LineString></Placemark></Document></kml>`;

const file = (bytes: Uint8Array, name: string) => new File([new Uint8Array(bytes)], name);

describe('gzip', () => {
  it('opens a .gpx.gz and names the route without either extension', async () => {
    const routes = await importRouteFiles(file(gzipSync(strToU8(gpx())), 'activity.gpx.gz'));
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ name: 'activity', format: 'gpx' });
  });

  it('refuses a damaged .gz', async () => {
    const bytes = gzipSync(strToU8(gpx()));
    await expect(importRouteFiles(file(bytes.subarray(0, 12), 'a.gpx.gz'))).rejects.toMatchObject({ code: 'archive' });
    await expect(importRouteFiles(file(new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 'a.gz'))).rejects.toMatchObject({ code: 'archive' });
  });

  it('stops a decompression bomb partway', async () => {
    const bomb = gzipSync(new Uint8Array(ROUTE_ARCHIVE_LIMITS.entryBytes + 1024 * 1024));
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(importRouteFiles(file(bomb, 'bomb.gpx.gz'))).rejects.toMatchObject({ code: 'archive' });
  });
});

describe('zip', () => {
  it('opens a KMZ through doc.kml', async () => {
    const kmz = zipSync({ 'doc.kml': strToU8(kml), 'files/icon.png': new Uint8Array([1, 2, 3]) });
    const routes = await importRouteFiles(file(kmz, 'Trail.kmz'));
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ name: 'Trail', format: 'kml' });
  });

  it('falls back to the first .kml in a KMZ without doc.kml', async () => {
    const routes = await importRouteFiles(file(zipSync({ 'trail.kml': strToU8(kml) }), 'x.kmz'));
    expect(routes).toHaveLength(1);
  });

  it('gives one route per route file, skipping junk and folders', async () => {
    const zip = zipSync({
      'a.gpx': strToU8(gpx(3, 46)),
      'sub/b.GPX': strToU8(gpx(3, 47)),
      '__MACOSX/._a.gpx': new Uint8Array([0, 1, 2]),
      'readme.txt': strToU8('hello'),
    });
    const routes = await importRouteFiles(file(zip, 'runs.zip'));
    expect(routes.map((r) => r.name).sort()).toEqual(['a', 'b']);
  });

  it('opens a zip > gz > gpx chain but not one level deeper', async () => {
    const chain = zipSync({ 'run.gpx.gz': gzipSync(strToU8(gpx())) });
    expect(await importRouteFiles(file(chain, 'orig.zip'))).toHaveLength(1);
    const tooDeep = zipSync({ 'inner.zip': zipSync({ 'run.gpx.gz': gzipSync(strToU8(gpx())) }) });
    // the inner .zip is not a route entry, so nesting two zips finds nothing to open
    await expect(importRouteFiles(file(tooDeep, 'outer.zip'))).rejects.toMatchObject({ code: 'archive' });
    const gzOfZip = gzipSync(zipSync({ 'run.gpx.gz': gzipSync(strToU8(gpx())) }));
    await expect(importRouteFiles(file(gzOfZip, 'x.zip.gz'))).rejects.toMatchObject({ code: 'archive' });
  });

  it('imports up to 20 routes and refuses more with the count', async () => {
    const make = (n: number) => zipSync(Object.fromEntries(Array.from({ length: n }, (_, i) => [`r${i}.gpx`, strToU8(gpx())])));
    expect(await importRouteFiles(file(make(20), 'twenty.zip'))).toHaveLength(20);
    await expect(importRouteFiles(file(make(21), 'many.zip'))).rejects.toMatchObject({
      code: 'archive',
      message: 'This archive has 21 routes; unzip it and pick the files you want.',
    });
  });

  it('keeps the routes that read when one file in the zip is bad', async () => {
    const zip = zipSync({ 'good.gpx': strToU8(gpx()), 'bad.gpx': strToU8('<gpx><trk>') });
    const routes = await importRouteFiles(file(zip, 'mixed.zip'));
    expect(routes.map((r) => r.name)).toEqual(['good']);
  });

  it('reports the first problem when no file in the zip reads', async () => {
    await expect(importRouteFiles(file(zipSync({ 'bad.gpx': strToU8('<gpx><trk>') }), 'bad.zip'))).rejects.toThrow();
    await expect(importRouteFiles(file(zipSync({ 'notes.txt': strToU8('hi') }), 'empty.zip'))).rejects.toMatchObject({ code: 'archive' });
    await expect(importRouteFiles(file(zipSync({}), 'nothing.zip'))).rejects.toMatchObject({ code: 'archive' });
  });

  it('refuses an entry that declares more than the per-file limit, without inflating it', async () => {
    const zip = zipSync({ 'huge.gpx': new Uint8Array(ROUTE_ARCHIVE_LIMITS.entryBytes + 1024 * 1024) }, { level: 1 });
    expect(zip.length).toBeLessThan(1024 * 1024);
    await expect(importRouteFiles(file(zip, 'huge.zip'))).rejects.toMatchObject({ code: 'archive' });
  });

  it('does not trust a declared size smaller than the real data', async () => {
    const zip = zipSync({ 'liar.gpx': strToU8(gpx(2000)) });
    // The original size field sits at offset 22 of the local header and at 24 of the central directory entry.
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    view.setUint32(22, 10, true);
    const cd = Array.from(zip).findIndex((_, i) => view.getUint32(i, true) === 0x02014b50);
    view.setUint32(cd + 24, 10, true);
    await expect(importRouteFiles(file(zip, 'liar.zip'))).rejects.toThrow();
  });

  it('refuses a truncated zip and a bare zip signature', async () => {
    const zip = zipSync({ 'a.gpx': strToU8(gpx()) });
    await expect(importRouteFiles(file(zip.subarray(0, zip.length - 30), 'cut.zip'))).rejects.toMatchObject({ code: 'archive' });
    await expect(importRouteFiles(file(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'sig.zip'))).rejects.toMatchObject({ code: 'archive' });
  });

  it('refuses an archive with too many entries', async () => {
    const zip = zipSync(Object.fromEntries(Array.from({ length: ROUTE_ARCHIVE_LIMITS.entries + 1 }, (_, i) => [`f${i}.txt`, new Uint8Array([1])])));
    await expect(importRouteFiles(file(zip, 'lots.zip'))).rejects.toMatchObject({ code: 'archive' });
  });
});
