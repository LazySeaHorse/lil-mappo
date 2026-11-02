import { describe, expect, it } from 'vitest';
import { stringifyProjectFile } from './projectFileJson';

describe('stringifyProjectFile', () => {
  const doc = {
    name: 'Prussia',
    empty: {},
    none: [],
    items: [
      {
        id: 'b1',
        geojson: { type: 'MultiPolygon', coordinates: [[[[13.4, 52.5], [13.5, 52.6], [13.4, 52.5]]]] },
        tags: ['a', 'b'],
        source: null,
      },
    ],
  };

  it('reads back exactly like plain JSON', () => {
    expect(JSON.parse(stringifyProjectFile(doc))).toEqual(doc);
  });

  it('keeps coordinates on one line and indents objects', () => {
    const text = stringifyProjectFile(doc);
    expect(text).toContain('"coordinates": [[[[13.4,52.5],[13.5,52.6],[13.4,52.5]]]]');
    expect(text).toContain('\n  "items": [\n    {\n      "id": "b1",');
    expect(text).toContain('"empty": {}');
    expect(text).toContain('"none": []');
  });

  it('indents an array that holds objects', () => {
    expect(stringifyProjectFile([{ a: 1 }, [{ b: 2 }]])).toBe('[\n  {\n    "a": 1\n  },\n  [\n    {\n      "b": 2\n    }\n  ]\n]');
  });

  it('follows JSON.stringify for undefined, functions and toJSON', () => {
    const value = { gone: undefined, fn: () => 1, when: new Date(0), list: [undefined, 1] };
    expect(JSON.parse(stringifyProjectFile(value))).toEqual(JSON.parse(JSON.stringify(value)));
  });

  it('is much smaller than indented JSON for an outline', () => {
    const ring = Array.from({ length: 1000 }, (_, i) => [13 + i / 1e4, 52 + i / 1e4]);
    const outline = { geojson: { type: 'Polygon', coordinates: [ring] } };
    expect(stringifyProjectFile(outline).length * 3).toBeLessThan(JSON.stringify(outline, null, 2).length);
  });
});
