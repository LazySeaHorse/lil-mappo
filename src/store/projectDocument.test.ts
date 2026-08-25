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

  it('migrates legacy item defaults before validating v1', () => {
    const project = createProject({ id: 'legacy-project' });
    const legacyRoute = {
      kind: 'route' as const,
      id: 'route-1',
      name: 'Legacy route',
      geojson: { type: 'FeatureCollection' as const, features: [] },
      startTime: 0,
      endTime: 5,
      style: {
        color: '#abcdef',
        width: 4,
        glow: true,
        glowWidth: 12,
        trailFade: false,
        trailFadeLength: 0.3,
        dashPattern: null,
      },
      easing: 'linear' as const,
    };
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
      },
      easing: 'linear' as const,
    };
    const legacyCallout = {
      kind: 'callout' as const,
      id: 'callout-1',
      title: 'Legacy callout',
      subtitle: '',
      imageUrl: null,
      lngLat: [0, 0] as [number, number],
      anchor: 'bottom' as const,
      startTime: 0,
      endTime: 5,
      animation: {
        enter: 'fadeIn' as const,
        exit: 'fadeOut' as const,
        enterDuration: 0.3,
        exitDuration: 0.3,
      },
      style: {
        bgColor: '#ffffff',
        textColor: '#000000',
        accentColor: '#abcdef',
        borderRadius: 8,
        shadow: true,
        maxWidth: 320,
        fontFamily: 'Inter',
        variant: 'default' as const,
        showMetadata: false,
      },
      altitude: 0,
      poleVisible: false,
      poleColor: '#ffffff',
    };
    const { schemaVersion: _, ...legacy } = toProjectDocument(project);
    const legacyDocument = {
      ...legacy,
      items: {
        ...legacy.items,
        [legacyRoute.id]: legacyRoute,
        [legacyBoundary.id]: legacyBoundary,
        [legacyCallout.id]: legacyCallout,
      },
      itemOrder: [...legacy.itemOrder, legacyRoute.id, legacyBoundary.id, legacyCallout.id],
      playheadTime: 12,
    };

    const parsed = parseProjectDocument(legacyDocument);
    const route = parsed.items[legacyRoute.id];
    const boundary = parsed.items[legacyBoundary.id];
    const callout = parsed.items[legacyCallout.id];
    expect(route.kind).toBe('route');
    if (route.kind === 'route') {
      expect(route.style.glowColor).toBe('#abcdef');
    }
    expect(boundary.kind).toBe('boundary');
    if (boundary.kind === 'boundary') {
      expect(boundary.style.fillColor).toBe('#123456');
      expect(boundary.style.traceLength).toBe(0.1);
    }
    expect(callout.kind).toBe('callout');
    if (callout.kind === 'callout') {
      expect(callout.linkTitleToLocation).toBe(false);
    }
    expect(parsed).not.toHaveProperty('playheadTime');
    expect(toProjectDocument(parsed).schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
  });

  it('rejects project files from newer unsupported schema versions', () => {
    const document = toProjectDocument(createProject());
    expect(() => parseProjectDocument({ ...document, schemaVersion: 999 }))
      .toThrow('newer than supported version');
  });

  it('rejects malformed project data instead of partially hydrating the store', () => {
    expect(() => parseProjectDocument({ id: 'bad', items: [] })).toThrow();
  });
});
