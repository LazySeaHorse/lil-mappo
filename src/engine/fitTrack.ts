/**
 * Reads the GPS track out of a Garmin FIT activity file (Garmin Connect "original", Strava originals).
 * Only record messages are read, and only position and altitude from them, so the rest of the FIT
 * profile (laps, sessions, sensors, developer fields) is stepped over by size. Damaged or cut-off
 * files give the points read so far; the checksum is not checked, which keeps files from a watch
 * that died mid-activity importable.
 */

const RECORD_MESSAGE = 20;
const FIELD_LAT = 0;
const FIELD_LNG = 1;
const FIELD_ALTITUDE = 2;
const FIELD_ENHANCED_ALTITUDE = 78;

const SEMICIRCLES_TO_DEGREES = 180 / 2 ** 31;
const INVALID_SINT32 = 0x7fffffff;

interface MessageDefinition {
  littleEndian: boolean;
  globalNumber: number;
  /** The fields of a data message in order; only their number and size are needed to step through them. */
  fields: { num: number; size: number }[];
  developerSize: number;
  dataSize: number;
}

/** True when the bytes start like a FIT file: a 12 or 14 byte header with ".FIT" at offset 8. */
export function isFitFile(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && (bytes[0] === 12 || bytes[0] === 14) && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54;
}

/** The track as [lng, lat] or [lng, lat, altitude] positions, in file order. Empty when the file has no GPS. */
export function readFitTrack(bytes: Uint8Array): number[][] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const coords: number[][] = [];
  let at = 0;
  // Several FIT files can be chained back to back; each has its own header, data and checksum.
  while (at + 12 <= bytes.length && isFitFile(bytes.subarray(at))) {
    const headerSize = bytes[at];
    const dataEnd = Math.min(bytes.length, at + headerSize + view.getUint32(at + 4, true));
    readRecords(view, at + headerSize, dataEnd, coords);
    at = dataEnd + 2;
  }
  return coords;
}

function readRecords(view: DataView, start: number, end: number, coords: number[][]): void {
  const definitions = new Map<number, MessageDefinition>();
  let at = start;
  while (at < end) {
    const header = view.getUint8(at++);
    const compressed = (header & 0x80) !== 0;
    const localType = compressed ? (header >> 5) & 0x03 : header & 0x0f;

    if (!compressed && (header & 0x40) !== 0) {
      const hasDeveloperFields = (header & 0x20) !== 0;
      if (at + 5 > end) return;
      const littleEndian = view.getUint8(at + 1) === 0;
      const globalNumber = view.getUint16(at + 2, littleEndian);
      const fieldCount = view.getUint8(at + 4);
      at += 5;
      if (at + fieldCount * 3 > end) return;
      const fields: { num: number; size: number }[] = [];
      let dataSize = 0;
      for (let i = 0; i < fieldCount; i++, at += 3) {
        const size = view.getUint8(at + 1);
        fields.push({ num: view.getUint8(at), size });
        dataSize += size;
      }
      let developerSize = 0;
      if (hasDeveloperFields) {
        if (at >= end) return;
        const developerCount = view.getUint8(at++);
        if (at + developerCount * 3 > end) return;
        for (let i = 0; i < developerCount; i++, at += 3) developerSize += view.getUint8(at + 1);
      }
      definitions.set(localType, { littleEndian, globalNumber, fields, developerSize, dataSize: dataSize + developerSize });
      continue;
    }

    const definition = definitions.get(localType);
    if (!definition || at + definition.dataSize > end) return;
    if (definition.globalNumber === RECORD_MESSAGE) readRecord(view, at, definition, coords);
    at += definition.dataSize;
  }
}

function readRecord(view: DataView, start: number, definition: MessageDefinition, coords: number[][]): void {
  const { littleEndian } = definition;
  let lat: number | null = null;
  let lng: number | null = null;
  let altitude: number | null = null;
  let enhancedAltitude: number | null = null;
  let at = start;
  for (const { num, size } of definition.fields) {
    if (num === FIELD_LAT || num === FIELD_LNG) {
      if (size === 4) {
        const raw = view.getInt32(at, littleEndian);
        if (raw !== INVALID_SINT32) {
          if (num === FIELD_LAT) lat = raw * SEMICIRCLES_TO_DEGREES;
          else lng = raw * SEMICIRCLES_TO_DEGREES;
        }
      }
    } else if (num === FIELD_ALTITUDE && size === 2) {
      const raw = view.getUint16(at, littleEndian);
      if (raw !== 0xffff) altitude = raw / 5 - 500;
    } else if (num === FIELD_ENHANCED_ALTITUDE && size === 4) {
      const raw = view.getUint32(at, littleEndian);
      if (raw !== 0xffffffff) enhancedAltitude = raw / 5 - 500;
    }
    at += size;
  }
  if (lat === null || lng === null) return;
  // Watches write 0,0 (or out-of-range values) while they have no fix.
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return;
  const height = enhancedAltitude ?? altitude;
  coords.push(height === null ? [lng, lat] : [lng, lat, height]);
}
