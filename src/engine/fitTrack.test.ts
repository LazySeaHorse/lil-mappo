import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { gzipSync } from 'fflate';
import { importRouteFiles } from '@/services/fileImport';
import { isFitFile, readFitTrack } from './fitTrack';

const semi = (deg: number) => Math.round((deg * 2 ** 31) / 180);

/** Bytes of integers in the given size and byte order. */
function int(value: number, size: number, little: boolean): number[] {
  const out: number[] = [];
  let v = BigInt.asUintN(size * 8, BigInt(value));
  for (let i = 0; i < size; i++) {
    out.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return little ? out : out.reverse();
}

interface Spec { num: number; size: number }

/** A definition message for a local type. */
function definition(local: number, global: number, fields: Spec[], opts: { little?: boolean; developer?: Spec[] } = {}): number[] {
  const little = opts.little ?? true;
  const header = 0x40 | local | (opts.developer ? 0x20 : 0);
  const out = [header, 0, little ? 0 : 1, ...int(global, 2, little), fields.length];
  for (const f of fields) out.push(f.num, f.size, 0);
  if (opts.developer) {
    out.push(opts.developer.length);
    for (const f of opts.developer) out.push(f.num, f.size, 0);
  }
  return out;
}

const data = (local: number, ...values: number[][]) => [local, ...values.flat()];

/** A complete FIT file. `bytes` is the message stream. */
function fit(bytes: number[], opts: { header?: 12 | 14; crc?: boolean } = {}): Uint8Array {
  const headerSize = opts.header ?? 14;
  const head = [headerSize, 0x20, ...int(2100, 2, true), ...int(bytes.length, 4, true), 0x2e, 0x46, 0x49, 0x54];
  if (headerSize === 14) head.push(0, 0);
  return new Uint8Array([...head, ...bytes, ...(opts.crc === false ? [] : [0, 0])]);
}

const RECORD_FIELDS: Spec[] = [{ num: 0, size: 4 }, { num: 1, size: 4 }, { num: 2, size: 2 }];
const record = (lat: number, lng: number, altitude = 0xffff, little = true) =>
  data(0, int(semi(lat), 4, little), int(semi(lng), 4, little), int(altitude, 2, little));

const near = (coords: number[][], expected: number[][]) => {
  expect(coords).toHaveLength(expected.length);
  coords.forEach((c, i) => c.forEach((v, j) => expect(v).toBeCloseTo(expected[i][j], 5)));
};

describe('readFitTrack', () => {
  it('reads positions and altitude from record messages', () => {
    const file = fit([...definition(0, 20, RECORD_FIELDS), ...record(46.5, 8.25, (100 + 500) * 5), ...record(46.6, 8.35)]);
    expect(isFitFile(file)).toBe(true);
    near(readFitTrack(file), [[8.25, 46.5, 100], [8.35, 46.6]]);
  });

  it('reads big-endian files and 12 byte headers', () => {
    const file = fit([...definition(0, 20, RECORD_FIELDS, { little: false }), ...record(-33.9, 151.2, 3000, false)], { header: 12 });
    near(readFitTrack(file), [[151.2, -33.9, 100]]);
  });

  it('prefers enhanced altitude when both are present', () => {
    const fields = [...RECORD_FIELDS, { num: 78, size: 4 }];
    const file = fit([
      ...definition(0, 20, fields),
      ...data(0, int(semi(10), 4, true), int(semi(20), 4, true), int(3000, 2, true), int((250 + 500) * 5, 4, true)),
    ]);
    near(readFitTrack(file), [[20, 10, 250]]);
  });

  it('steps over other messages, developer fields and timestamp fields', () => {
    const withTime: Spec[] = [{ num: 253, size: 4 }, ...RECORD_FIELDS];
    const file = fit([
      ...definition(1, 21, [{ num: 0, size: 1 }, { num: 1, size: 1 }]), // an event message
      ...data(1, [0], [9]),
      ...definition(0, 20, withTime, { developer: [{ num: 0, size: 3 }] }),
      ...data(0, int(1000, 4, true), int(semi(1), 4, true), int(semi(2), 4, true), int(0xffff, 2, true), [7, 7, 7]),
      ...data(0, int(1001, 4, true), int(semi(1.1), 4, true), int(semi(2.1), 4, true), int(0xffff, 2, true), [7, 7, 7]),
    ]);
    near(readFitTrack(file), [[2, 1], [2.1, 1.1]]);
  });

  it('reads records written with a compressed timestamp header', () => {
    // Bit 7 set: local type in bits 5-6, time offset in bits 0-4. The definition has no timestamp field.
    const header = 0x80 | (2 << 5) | 5;
    const file = fit([
      ...definition(2, 20, RECORD_FIELDS),
      header, ...int(semi(5), 4, true), ...int(semi(6), 4, true), ...int(0xffff, 2, true),
    ]);
    near(readFitTrack(file), [[6, 5]]);
  });

  it('drops invalid positions: no-fix markers, 0,0 and out-of-range values', () => {
    const invalid = data(0, int(0x7fffffff, 4, true), int(0x7fffffff, 4, true), int(0xffff, 2, true));
    const onlyLat = data(0, int(semi(10), 4, true), int(0x7fffffff, 4, true), int(0xffff, 2, true));
    const file = fit([
      ...definition(0, 20, RECORD_FIELDS),
      ...invalid,
      ...onlyLat,
      ...record(0, 0),
      ...data(0, int(0x40000000, 4, true), int(0, 4, true), int(0xffff, 2, true)), // 90 degrees is fine, checked below
      ...data(0, int(0x60000000, 4, true), int(0, 4, true), int(0xffff, 2, true)), // 135 degrees latitude: out of range
      ...record(11, 12),
    ]);
    near(readFitTrack(file), [[0, 90], [12, 11]]);
  });

  it('gives nothing for an indoor file with no GPS fields', () => {
    const file = fit([...definition(0, 20, [{ num: 3, size: 1 }]), ...data(0, [120]), ...data(0, [121])]);
    expect(readFitTrack(file)).toEqual([]);
  });

  it('joins a multisport file into one line', () => {
    const file = fit([
      ...definition(0, 20, RECORD_FIELDS),
      ...record(1, 1),
      ...definition(1, 18, [{ num: 5, size: 1 }]), // a session message between the sports
      ...data(1, [1]),
      ...record(2, 2),
    ]);
    expect(readFitTrack(file)).toHaveLength(2);
  });

  it('reads FIT files chained back to back', () => {
    const one = fit([...definition(0, 20, RECORD_FIELDS), ...record(1, 1)]);
    const two = fit([...definition(0, 20, RECORD_FIELDS), ...record(2, 2), ...record(3, 3)]);
    expect(readFitTrack(new Uint8Array([...one, ...two]))).toHaveLength(3);
  });

  it('keeps the points read from a truncated file and ignores a bad checksum', () => {
    const body = [...definition(0, 20, RECORD_FIELDS), ...record(1, 1), ...record(2, 2), ...record(3, 3)];
    const whole = fit(body);
    expect(readFitTrack(whole.subarray(0, whole.length - 7))).toHaveLength(2);
    const badCrc = fit(body);
    badCrc[badCrc.length - 1] = 0xff;
    expect(readFitTrack(badCrc)).toHaveLength(3);
  });

  it('stops at data with no definition instead of guessing', () => {
    expect(readFitTrack(fit([...record(1, 1)]))).toEqual([]);
  });

  it('reads 100k records', () => {
    const records: number[] = [];
    for (let i = 0; i < 100_000; i++) records.push(...record(46 + (i % 1000) / 1e4, 8 + (i % 1000) / 1e4));
    expect(readFitTrack(fit([...definition(0, 20, RECORD_FIELDS), ...records]))).toHaveLength(100_000);
  });

  it('does not throw on random bytes after a valid header', () => {
    const junk = Array.from({ length: 400 }, (_, i) => (i * 37 + 11) & 0xff);
    expect(() => readFitTrack(fit(junk))).not.toThrow();
    expect(() => readFitTrack(new Uint8Array([14, 0x20, 0, 0, 255, 255, 255, 127, 0x2e, 0x46, 0x49, 0x54]))).not.toThrow();
  });
});

describe('FIT through the importer', () => {
  const body = [...definition(0, 20, RECORD_FIELDS), ...record(46, 8), ...record(46.1, 8.1)];

  it('imports a .fit and names it without the extension', async () => {
    const [route] = await importRouteFiles(new File([new Uint8Array(fit(body))], 'Morning Run.fit'));
    expect(route).toMatchObject({ name: 'Morning Run', format: 'fit' });
    expect(route.geojson.features[0].geometry.type).toBe('LineString');
  });

  it('imports a .fit.gz (Strava bulk export)', async () => {
    const [route] = await importRouteFiles(new File([new Uint8Array(gzipSync(fit(body)))], '123.fit.gz'));
    expect(route).toMatchObject({ name: '123', format: 'fit' });
  });

  it('refuses an indoor FIT as having no GPS track', async () => {
    const indoor = fit([...definition(0, 20, [{ num: 3, size: 1 }]), ...data(0, [120])]);
    await expect(importRouteFiles(new File([new Uint8Array(indoor)], 'trainer.fit'))).rejects.toMatchObject({ code: 'noTrack' });
  });

  it('never throws on arbitrary bytes behind a FIT header', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (junk) => {
        readFitTrack(fit(Array.from(junk)));
      }),
      { numRuns: 200 },
    );
  });
});
