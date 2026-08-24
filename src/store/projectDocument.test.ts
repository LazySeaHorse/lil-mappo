import { describe, expect, it } from 'vitest';
import {
  PROJECT_SCHEMA_VERSION,
  createProject,
  parseProjectDocument,
  toProjectDocument,
} from './projectDocument';
import { createTransientState, useProjectStore } from './useProjectStore';

describe('project document persistence boundary', () => {
  it('serializes only durable project fields from the Zustand store', () => {
    const store = useProjectStore.getState();
    const document = toProjectDocument(store);

    expect(Object.keys(document)).toEqual([
      'schemaVersion',
      'id',
      'name',
      'duration',
      'fps',
      'resolution',
      'aspectRatio',
      'exportResolution',
      'isVertical',
      'projection',
      'lightPreset',
      'starIntensity',
      'fogColor',
      'terrainExaggeration',
      'items',
      'itemOrder',
      'mapCenter',
    ]);
    expect(document.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(document).not.toHaveProperty('playheadTime');
    expect(document).not.toHaveProperty('previewRoute');
    expect(document).not.toHaveProperty('selectedItemId');
    expect(document).not.toHaveProperty('setDuration');
  });

  it('strips unknown and transient keys from untrusted documents', () => {
    const project = createProject({ id: 'polluted-project' });
    const parsed = parseProjectDocument({
      ...project,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      isExporting: true,
      previewRoute: { type: 'FeatureCollection', features: [] },
      selectedItemId: 'something',
      setDuration: null,
    });

    expect(parsed).not.toHaveProperty('schemaVersion');
    expect(parsed).not.toHaveProperty('isExporting');
    expect(parsed).not.toHaveProperty('previewRoute');
    expect(parsed).not.toHaveProperty('selectedItemId');
    expect(parsed).not.toHaveProperty('setDuration');
  });

  it('loads polluted input without allowing it to replace store actions', () => {
    const project = createProject({ id: 'safe-load' });

    useProjectStore.getState().loadFullProject({
      ...project,
      isExporting: true,
      isCameraEnabled: false,
      previewRoute: { type: 'FeatureCollection', features: [] },
      setDuration: null,
    });

    const loaded = useProjectStore.getState();
    expect(typeof loaded.setDuration).toBe('function');
    expect(loaded.isExporting).toBe(false);
    expect(loaded.isCameraEnabled).toBe(true);
    expect(loaded.previewRoute).toBeNull();
  });

  it('resets every transient field from the shared defaults when loading', () => {
    const defaults = createTransientState();
    const dirtyEntries = Object.entries(defaults).map(([key, value]) => {
      if (typeof value === 'boolean') return [key, !value];
      if (typeof value === 'number') return [key, value + 1];
      if (typeof value === 'string') return [key, `${value}-dirty`];
      return [key, { dirty: true }];
    });
    type StoreState = ReturnType<typeof useProjectStore.getState>;
    useProjectStore.setState(
      Object.fromEntries(dirtyEntries) as unknown as Partial<StoreState>,
    );

    useProjectStore.getState().loadFullProject(createProject({ id: 'transient-reset' }));

    const loaded = useProjectStore.getState();
    const expected = {
      ...defaults,
      isInspectorOpen: true,
      detectedCapabilities: null,
    };
    for (const key of Object.keys(defaults) as Array<keyof typeof defaults>) {
      expect(loaded[key]).toEqual(expected[key]);
    }
  });

  it('accepts legacy unversioned projects and normalizes legacy boundary color', () => {
    const project = createProject({ id: 'legacy-project' });
    const legacyBoundary = {
      kind: 'boundary' as const,
      id: 'boundary-1',
      placeName: 'Legacy boundary',
      geojson: null,
      resolveStatus: 'resolved' as const,
      startTime: 0,
      endTime: 5,
      style: {
        strokeColor: '#123456',
        strokeWidth: 3,
        glow: false,
        fillOpacity: 0.2,
        animateStroke: true,
        animationStyle: 'draw' as const,
        traceLength: 0.1,
      },
      easing: 'linear' as const,
    };
    const { schemaVersion: _, ...legacy } = toProjectDocument(project);
    const legacyDocument = {
      ...legacy,
      items: { ...legacy.items, [legacyBoundary.id]: legacyBoundary },
      itemOrder: [...legacy.itemOrder, legacyBoundary.id],
    };

    const parsed = parseProjectDocument(legacyDocument);
    const boundary = parsed.items[legacyBoundary.id];
    expect(boundary.kind).toBe('boundary');
    if (boundary.kind === 'boundary') {
      expect(boundary.style.fillColor).toBe('#123456');
    }
  });

  it('rejects malformed project data instead of partially hydrating the store', () => {
    expect(() => parseProjectDocument({ id: 'bad', items: [] })).toThrow();
  });
});
