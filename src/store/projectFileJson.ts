/**
 * Text of a `.lilmap` project file: indented JSON, so a person can still read and diff it, except
 * arrays that hold no objects (coordinates, number lists), which stay on one line. A boundary
 * outline has thousands of points; indented one number per line it was about 4x bigger.
 * `JSON.parse` reads it back exactly like plain `JSON.stringify` output.
 */
export function stringifyProjectFile(value: unknown): string {
  // Plain JSON data first, so `toJSON`, `undefined` and functions follow JSON.stringify's own rules.
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('A project file must be JSON data.');
  return write(JSON.parse(text) as JsonValue, '');
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const INDENT = '  ';

/** An array with no object anywhere inside it, like `[[13.4, 52.5], [13.5, 52.6]]`. */
function isFlat(values: JsonValue[]): boolean {
  return values.every((v) => v === null || typeof v !== 'object' || (Array.isArray(v) && isFlat(v)));
}

function write(value: JsonValue, indent: string): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const inner = indent + INDENT;
  if (Array.isArray(value)) {
    if (value.length === 0 || isFlat(value)) return JSON.stringify(value);
    return `[\n${value.map((v) => inner + write(v, inner)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${write(v, inner)}`).join(',\n')}\n${indent}}`;
}
