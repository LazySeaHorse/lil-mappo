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

  describe('v1 → v2 callout migration', () => {
    const v1Callout = {
      kind: 'callout',
      id: 'c1',
      title: 'Harbour',
      subtitle: '',
      imageUrl: null,
      lngLat: [0, 0.0001],
      anchor: 'bottom',
      startTime: 4,
      endTime: 6,
      animation: { enter: 'fadeIn', exit: 'fadeOut', enterDuration: 0.4, exitDuration: 0.3 },
      style: {
        bgColor: '#0f172a', textColor: '#f8fafc', accentColor: '#3b82f6', borderRadius: 8,
        shadow: true, maxWidth: 240, fontFamily: 'Outfit', variant: 'default', showMetadata: true,
      },
      linkTitleToLocation: false,
      altitude: 100,
      poleVisible: true,
      poleColor: '#94a3b8',
    };

    function v1Document(items: Record<string, unknown>) {
      const { items: _items, itemOrder: _order, ...rest } = toProjectDocument(createProject());
      return { ...rest, schemaVersion: 1, items, itemOrder: Object.keys(items) };
    }

    it('converts callout altitude at the zoom the camera shows mid-callout', () => {
      const camera = {
        kind: 'camera',
        id: 'camera-track',
        keyframes: [
          { id: 'k1', time: 0, camera: { center: [0, 0], zoom: 14, pitch: 0, bearing: 0, altitude: null }, easing: 'linear', followRoute: null },
          { id: 'k2', time: 10, camera: { center: [0, 0], zoom: 18, pitch: 0, bearing: 0, altitude: null }, easing: 'linear', followRoute: null },
        ],
      };
      const project = parseProjectDocument(v1Document({ 'camera-track': camera, c1: v1Callout }));
      const callout = project.items.c1;
      expect(callout.kind).toBe('callout');
      // Mid-callout (t=5) the camera is at zoom 16: 100 m ≈ 42 px at the equator.
      if (callout.kind === 'callout' && callout.binding.kind === 'geographic') {
        expect(callout.binding.altitude).toBe(42);
      }
    });

    it('repairs v1 documents that lack a camera track instead of rejecting them', () => {
      const project = parseProjectDocument(v1Document({ c1: v1Callout }));
      expect(project.items['camera-track']).toEqual({ kind: 'camera', id: 'camera-track', keyframes: [] });
      const callout = project.items.c1;
      // No keyframes: converted at the default editor zoom (12).
      if (callout.kind === 'callout' && callout.binding.kind === 'geographic') {
        expect(callout.binding.altitude).toBe(3);
      }
    });
  });
});
