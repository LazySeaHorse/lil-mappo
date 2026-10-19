import { describe, expect, it } from 'vitest';
import { CAMERA_TRACK_ID, PROJECT_SCHEMA_VERSION, createProject, parseProjectDocument, toProjectDocument } from './projectDocument';
import type { ModelAsset, ModelItem, RouteItem } from './types';

const asset: ModelAsset = {
  id: 'asset-1',
  fileName: 'tower.glb',
  byteSize: 1234,
  sha256: 'a'.repeat(64),
  bounds: { min: [-1, 0, -2], max: [1, 10, 2] },
};

const modelItem: ModelItem = {
  kind: 'model',
  id: 'model-1',
  name: 'Tower',
  assetId: 'asset-1',
  position: [2.35, 48.85],
  altitude: 5,
  heading: 90,
  pitch: 0,
  roll: 0,
  scale: 2,
  startTime: 1,
  endTime: 6,
  transition: { enter: 'rise', exit: 'fade', enterDuration: 0.8, exitDuration: 0.5 },
};

function baseDocument(extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: 'p1',
    name: 'Models',
    items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] } },
    itemOrder: [CAMERA_TRACK_ID],
    ...extra,
  };
}

describe('model items in the project document', () => {
  it('loads documents saved before models existed with no models', () => {
    const project = parseProjectDocument(baseDocument());
    expect(project.models).toEqual({});
  });

  it('keeps model items and their asset metadata through a save', () => {
    const project = createProject({
      id: 'p1',
      models: { [asset.id]: asset },
      items: {
        [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] },
        [modelItem.id]: modelItem,
      },
      itemOrder: [CAMERA_TRACK_ID, modelItem.id],
    });
    const saved = JSON.parse(JSON.stringify(toProjectDocument(project)));
    const loaded = parseProjectDocument(saved);
    expect(loaded.models).toEqual({ [asset.id]: asset });
    expect(loaded.items[modelItem.id]).toEqual(modelItem);
  });

  it('never stores model bytes or urls, only metadata', () => {
    const project = parseProjectDocument(baseDocument({
      models: { [asset.id]: { ...asset, bytes: [1, 2, 3], url: 'blob:x', dataUrl: 'data:...' } },
    }));
    expect(Object.keys(project.models[asset.id]).sort()).toEqual(['bounds', 'byteSize', 'fileName', 'id', 'sha256']);
  });

  it('fills defaults for a model item that lacks its newer fields', () => {
    const { altitude: _a, pitch: _p, roll: _r, transition: _t, ...partial } = modelItem;
    const project = parseProjectDocument(baseDocument({
      models: { [asset.id]: asset },
      items: {
        [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] },
        [modelItem.id]: partial,
      },
    }));
    const item = project.items[modelItem.id] as ModelItem;
    expect(item.altitude).toBe(0);
    expect(item.pitch).toBe(0);
    expect(item.roll).toBe(0);
    expect(item.transition).toEqual({ enter: 'fade', exit: 'fade', enterDuration: 0.5, exitDuration: 0.5 });
  });

  it('loads a model item whose asset metadata is gone (it shows as missing)', () => {
    const project = parseProjectDocument(baseDocument({
      items: {
        [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] },
        [modelItem.id]: modelItem,
      },
    }));
    expect(project.items[modelItem.id]).toMatchObject({ kind: 'model', assetId: 'asset-1' });
    expect(project.models).toEqual({});
  });

  it('accepts a custom route marker that points at an imported model', () => {
    const route: RouteItem = {
      kind: 'route',
      id: 'r1',
      name: 'Drive',
      geojson: { type: 'FeatureCollection', features: [] },
      startTime: 0,
      endTime: 5,
      style: { color: '#fff', width: 4, glow: false, glowWidth: 8, dashPattern: null, animationType: 'draw', cometTrailLength: 0.2 },
      easing: 'linear',
      exitAnimation: 'none',
      calculation: {
        mode: 'car', startPoint: [0, 0], endPoint: [1, 1], startName: '', endName: '',
        vehicle: { enabled: true, type: 'custom', modelId: 'asset-1', scale: 3 },
      },
    };
    const project = parseProjectDocument(baseDocument({
      models: { [asset.id]: asset },
      items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, r1: route },
    }));
    expect((project.items.r1 as RouteItem).calculation?.vehicle).toEqual({ enabled: true, type: 'custom', modelId: 'asset-1', scale: 3 });
  });

  it('rejects asset metadata with a malformed hash', () => {
    expect(() => parseProjectDocument(baseDocument({ models: { [asset.id]: { ...asset, sha256: 'nope' } } }))).toThrow();
  });

  it('clamps a model item size into the size slider range, as other out-of-range numbers are', () => {
    const load = (scale: unknown) => parseProjectDocument(baseDocument({
      models: { 'asset-1': asset },
      items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, 'model-1': { ...modelItem, scale } },
    })).items['model-1'] as ModelItem;
    expect(load(1e9).scale).toBe(10000);
    expect(load(0).scale).toBe(0.01);
    expect(load(-3).scale).toBe(0.01);
    expect(load('huge').scale).toBe(1);
    expect(load(2).scale).toBe(2);
  });

  it('keeps model bounds within 1,000 km of the origin and in order', () => {
    const project = parseProjectDocument(baseDocument({
      models: { 'asset-1': { ...asset, bounds: { min: [-1.7e308, 5, 0], max: [1.7e308, -5, 2] } } },
    }));
    expect(project.models['asset-1'].bounds).toEqual({ min: [-1e6, -5, 0], max: [1e6, 5, 2] });
  });

  it('loads valid model metadata unchanged', () => {
    const project = parseProjectDocument(baseDocument({ models: { 'asset-1': asset } }));
    expect(project.models['asset-1']).toEqual(asset);
  });
});

