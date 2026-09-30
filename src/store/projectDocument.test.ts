import { describe, expect, it } from 'vitest';
import {
  PROJECT_SCHEMA_VERSION,
  createProject,
  parseProjectDocument,
  toProjectDocument,
} from './projectDocument';
import { createTransientState, useProjectStore } from './useProjectStore';
import { leaderLineStyle } from '@/annotations/styles/leader-line';

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
      'mapStyle',
      'terrainEnabled',
      'buildingsEnabled',
      'labelVisibility',
      'show3dLandmarks',
      'show3dTrees',
      'show3dFacades',
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

  it('round-trips the persisted map look', () => {
    const look = {
      mapStyle: 'satellite',
      terrainEnabled: true,
      buildingsEnabled: true,
      labelVisibility: { road: false, poi: true },
      show3dLandmarks: false,
      show3dTrees: false,
      show3dFacades: false,
    };
    const project = createProject({ id: 'look', ...look });
    const reparsed = parseProjectDocument(JSON.parse(JSON.stringify(toProjectDocument(project))));
    expect(reparsed).toMatchObject(look);
  });

  it('defaults the map look for documents that predate it', () => {
    const { mapStyle, terrainEnabled, buildingsEnabled, labelVisibility, show3dLandmarks, show3dTrees, show3dFacades, ...old } =
      createProject({ id: 'old' });
    void [mapStyle, terrainEnabled, buildingsEnabled, labelVisibility, show3dLandmarks, show3dTrees, show3dFacades];
    const parsed = parseProjectDocument({ ...old, schemaVersion: PROJECT_SCHEMA_VERSION });
    expect(parsed).toMatchObject({
      mapStyle: 'standard',
      terrainEnabled: false,
      buildingsEnabled: false,
      labelVisibility: {},
      show3dLandmarks: true,
      show3dTrees: true,
      show3dFacades: true,
    });
  });

  it('falls back to standard for unknown map styles', () => {
    for (const bad of ['no-such-style', 42, null, '__proto__', 'toString']) {
      const parsed = parseProjectDocument({
        ...createProject({ id: 'bad-style' }),
        schemaVersion: PROJECT_SCHEMA_VERSION,
        mapStyle: bad,
      });
      expect(parsed.mapStyle).toBe('standard');
    }
  });

  it('keeps persisted map look but resets transient state on load', () => {
    useProjectStore.setState({ selectedItemId: 'x', playheadTime: 9 });
    useProjectStore.getState().loadFullProject(
      createProject({
        id: 'look-load',
        mapStyle: 'satellite',
        terrainEnabled: true,
        labelVisibility: { road: false },
      }),
    );
    const s = useProjectStore.getState();
    expect(s.mapStyle).toBe('satellite');
    expect(s.terrainEnabled).toBe(true);
    expect(s.labelVisibility).toEqual({ road: false });
    expect(s.selectedItemId).toBeNull();
    expect(s.playheadTime).toBe(0);
  });

  it('serializes a map style change, so draft dirty checks see it', () => {
    useProjectStore.getState().setMapStyle('standard');
    const before = JSON.stringify(toProjectDocument(useProjectStore.getState()));
    useProjectStore.getState().setMapStyle('satellite');
    const after = JSON.stringify(toProjectDocument(useProjectStore.getState()));
    expect(after).not.toBe(before);
    useProjectStore.getState().setMapStyle('standard');
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

  describe('v1 → v2 plane auto-camera migration', () => {
    function v1DocumentWithRoute(type: 'car' | 'plane', distance: number, height: number) {
      const { items: _items, itemOrder: _order, ...rest } = toProjectDocument(createProject());
      const routeItem = {
        kind: 'route', id: 'r1', name: 'Flight',
        geojson: { type: 'FeatureCollection', features: [] },
        startTime: 0, endTime: 10,
        style: {
          color: '#fff', width: 4, glow: false, glowColor: '#fff', glowWidth: 12,
          trailFade: false, trailFadeLength: 0.3, dashPattern: null,
        },
        easing: 'linear',
        calculation: {
          mode: 'flight', startPoint: [0, 0], endPoint: [1, 1],
          vehicle: { enabled: true, type, modelId: '', scale: 1 },
        },
        autoCam: {
          enabled: true, mode: 'cinematic', pitch: 65, smoothing: 0.3,
          distance, height, zoom: 14, lookAhead: 300,
        },
      };
      return {
        ...rest,
        schemaVersion: 1,
        items: { 'camera-track': { kind: 'camera', id: 'camera-track', keyframes: [] }, r1: routeItem },
        itemOrder: ['r1'],
      };
    }

    const autoCamOf = (doc: unknown) => {
      const r = parseProjectDocument(doc).items.r1;
      return r.kind === 'route' ? r.autoCam : undefined;
    };

    it('scales plane follow framing saved before the plane model was enlarged', () => {
      expect(autoCamOf(v1DocumentWithRoute('plane', 500, 300))).toMatchObject({ distance: 50000, height: 30000 });
    });

    it('leaves plane framing already in the plane range untouched', () => {
      expect(autoCamOf(v1DocumentWithRoute('plane', 50000, 30000))).toMatchObject({ distance: 50000, height: 30000 });
    });

    it('leaves car routes untouched', () => {
      expect(autoCamOf(v1DocumentWithRoute('car', 500, 300))).toMatchObject({ distance: 500, height: 300 });
    });
  });
  describe('v2 → v3 route calculation migration', () => {
    const routedGeometry: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 1], [0.2, 1.3], [0.7, 1.1], [1, 2]] } }],
    };

    function v2DocumentWithCalculation(calculation: Record<string, unknown>) {
      const { items: _items, itemOrder: _order, ...rest } = toProjectDocument(createProject());
      const routeItem = {
        kind: 'route', id: 'r1', name: 'Route',
        geojson: routedGeometry,
        startTime: 0, endTime: 10,
        style: {
          color: '#fff', width: 4, glow: false, glowColor: '#fff', glowWidth: 12,
          trailFade: false, trailFadeLength: 0.3, dashPattern: null,
        },
        easing: 'linear',
        calculation,
      };
      return {
        ...rest,
        schemaVersion: 2,
        items: { 'camera-track': { kind: 'camera', id: 'camera-track', keyframes: [] }, r1: routeItem },
        itemOrder: ['r1'],
      };
    }

    const migrate = (calculation: Record<string, unknown>) => {
      const route = parseProjectDocument(v2DocumentWithCalculation(calculation)).items.r1;
      if (route.kind !== 'route') throw new Error('expected a route');
      return route;
    };

    const vehicle = { enabled: true, type: 'dot', modelId: '', scale: 1 };

    it('turns API-routed walks into car routes and keeps their geometry', () => {
      const route = migrate({ mode: 'walk', startPoint: [0, 1], endPoint: [1, 2], vehicle });
      expect(route.calculation).toEqual({ mode: 'car', startPoint: [0, 1], endPoint: [1, 2], vehicle });
      expect(route.geojson).toEqual(routedGeometry);
    });

    it('turns manual routes into car routes and keeps their geometry', () => {
      const route = migrate({ mode: 'manual', startPoint: [0, 0], endPoint: [0, 0] });
      expect(route.calculation).toEqual({ mode: 'car', startPoint: [0, 0], endPoint: [0, 0] });
      expect(route.geojson).toEqual(routedGeometry);
    });

    it('keeps car and flight routes and drops freehand fields', () => {
      expect(migrate({ mode: 'flight', startPoint: [0, 1], endPoint: [1, 2], waypoints: [], vehicle }).calculation)
        .toEqual({ mode: 'flight', startPoint: [0, 1], endPoint: [1, 2], vehicle });
      expect(migrate({ mode: 'car', startPoint: [0, 1], endPoint: [1, 2], waypoints: [] }).calculation)
        .toEqual({ mode: 'car', startPoint: [0, 1], endPoint: [1, 2] });
    });

    it('turns freehand walk/manual routes into ordered walk points', () => {
      expect(migrate({
        mode: 'walk', startPoint: [0, 1], waypoints: [[0.5, 1.5]], endPoint: [1, 2], curved: false, sharpness: 0.4,
      }).calculation).toEqual({ mode: 'walk', points: [[0, 1], [0.5, 1.5], [1, 2]], curved: false, sharpness: 0.4 });

      expect(migrate({ mode: 'manual', startPoint: [0, 1], endPoint: [1, 2], waypoints: [[0.5, 1.5]] }).calculation)
        .toEqual({ mode: 'walk', points: [[0, 1], [0.5, 1.5], [1, 2]], curved: true, sharpness: 0.85 });
    });

    it('drops unset endpoints and the duplicated lone point from freehand walks', () => {
      expect(migrate({ mode: 'walk', startPoint: [5, 5], endPoint: [5, 5], waypoints: [], curved: true }).calculation)
        .toMatchObject({ points: [[5, 5]] });
      expect(migrate({ mode: 'walk', startPoint: [0, 0], endPoint: [0, 0], waypoints: [], curved: true }).calculation)
        .toMatchObject({ points: [] });
    });

    it('leaves routes without a calculation (imports) untouched', () => {
      const document = v2DocumentWithCalculation({});
      delete (document.items.r1 as { calculation?: unknown }).calculation;
      const route = parseProjectDocument(document).items.r1;
      expect(route).not.toHaveProperty('calculation');
    });
  });

  describe('v3 → v4 callout style migration', () => {
    const OLD_STYLE_IDS = [
      'standard-card', 'modern-pill', 'news-slug', 'topo-label',
      'blinking-dot', 'ripple-marker', 'image-circle', 'pin-marker',
    ];

    const v3Callout = (styleId: string, overrides: Record<string, unknown> = {}) => ({
      kind: 'callout',
      id: 'c1',
      styleId,
      styleVersion: 1,
      content: { title: 'Harbour', subtitle: 'Old town', eyebrow: '1°N', body: 'Busy', badge: 'NEW' },
      binding: { kind: 'geographic', lngLat: [10, 20], altitude: 40 },
      offset: [0, 0],
      anchor: 'center',
      startTime: 3,
      endTime: 9,
      transition: { enter: 'scale-up', exit: 'scale-down', enterDuration: 0.9, exitDuration: 0.6 },
      connector: { visible: true, style: 'solid', color: '#ff0000', width: 5, endDot: false, endDotRadius: 9 },
      opacity: 0.7,
      scale: 1.4,
      settings: { bgColor: '#123456', fontFamily: 'Lexend', variant: 'legacy' },
      linkTitleToLocation: true,
      ...overrides,
    });

    function v3Document(items: Record<string, unknown>) {
      const { items: _items, itemOrder: _order, ...rest } = toProjectDocument(createProject());
      const all = { 'camera-track': { kind: 'camera', id: 'camera-track', keyframes: [] }, ...items };
      return { ...rest, schemaVersion: 3, items: all, itemOrder: Object.keys(all) };
    }

    const calloutOf = (document: unknown, id = 'c1') => {
      const item = parseProjectDocument(document).items[id];
      if (item.kind !== 'callout') throw new Error('expected a callout');
      return item;
    };

    it.each(OLD_STYLE_IDS)('turns a %s callout into a Leader Line and keeps what it said and where it was', (styleId) => {
      const callout = calloutOf(v3Document({ c1: v3Callout(styleId) }));

      expect(callout).toMatchObject({
        id: 'c1',
        styleId: 'leader-line',
        styleVersion: 1,
        content: { title: 'Harbour', subtitle: 'Old town', eyebrow: '1°N', body: 'Busy', badge: 'NEW' },
        binding: { kind: 'geographic', lngLat: [10, 20], altitude: 40 },
        startTime: 3,
        endTime: 9,
        opacity: 0.7,
        scale: 1.4,
        linkTitleToLocation: true,
      });
    });

    it('resets settings, transition, connector and anchor to Leader Line defaults', () => {
      const callout = calloutOf(v3Document({ c1: v3Callout('news-slug') }));

      expect(callout.settings).toEqual(leaderLineStyle.defaultSettings);
      expect(callout.transition).toEqual({ enter: 'auto', exit: 'auto', enterDuration: 1.2, exitDuration: 0.5 });
      expect(callout.connector).toMatchObject({ visible: false });
      expect(callout.anchor).toBe('bottom');
    });

    it('gives callouts on or just beside their point the default offset so the leader line is not stubby', () => {
      for (const offset of [[0, 0], [0, 25], [-20, 12], [39, 0]]) {
        expect(calloutOf(v3Document({ c1: v3Callout('pin-marker', { offset }) })).offset).toEqual([70, -90]);
      }
    });

    it('keeps deliberate offsets of 40px or more', () => {
      expect(calloutOf(v3Document({ c1: v3Callout('topo-label', { offset: [-30, 45] }) })).offset).toEqual([-30, 45]);
      expect(calloutOf(v3Document({ c1: v3Callout('topo-label', { offset: [0, -40] }) })).offset).toEqual([0, -40]);
    });

    it('keeps screen-bound placement', () => {
      const callout = calloutOf(v3Document({ c1: v3Callout('standard-card', { binding: { kind: 'screen', position: [0.2, 0.4] } }) }));
      expect(callout.binding).toEqual({ kind: 'screen', position: [0.2, 0.4] });
    });

    it('leaves callouts that are already on a current style untouched', () => {
      const current = v3Callout('leader-line', {
        offset: [0, 0],
        settings: { side: 'left', lineWidth: 3 },
        transition: { enter: 'fade', exit: 'fade', enterDuration: 0.4, exitDuration: 0.3 },
      });
      const callout = calloutOf(v3Document({ c1: current }));

      expect(callout.offset).toEqual([0, 0]);
      expect(callout.transition).toEqual(current.transition);
      expect(callout.connector).toEqual(current.connector);
      expect(callout.anchor).toBe('center');
      expect(callout.settings).toMatchObject({ side: 'left', lineWidth: 3 });
    });

    it('migrates every callout in a mixed document and leaves other items alone', () => {
      const document = v3Document({
        c1: v3Callout('ripple-marker'),
        c2: v3Callout('leader-line', { id: 'c2', offset: [5, 5] }),
        c3: v3Callout('blinking-dot', { id: 'c3' }),
      });
      const project = parseProjectDocument(document);

      expect(['c1', 'c2', 'c3'].map((id) => (project.items[id] as { styleId: string }).styleId))
        .toEqual(['leader-line', 'leader-line', 'leader-line']);
      expect(calloutOf(document, 'c2').offset).toEqual([5, 5]);
      expect(project.items['camera-track'].kind).toBe('camera');
      expect(toProjectDocument(project).schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    });

    it('carries a v1 document all the way to Leader Line', () => {
      const v1Callout = {
        kind: 'callout', id: 'c1', title: 'Harbour', subtitle: 'Old town', imageUrl: null,
        lngLat: [0, 0.0001], anchor: 'bottom', startTime: 4, endTime: 6,
        animation: { enter: 'fadeIn', exit: 'fadeOut', enterDuration: 0.4, exitDuration: 0.3 },
        style: {
          bgColor: '#0f172a', textColor: '#f8fafc', accentColor: '#3b82f6', borderRadius: 8,
          shadow: true, maxWidth: 240, fontFamily: 'Outfit', variant: 'topo', showMetadata: true,
        },
        linkTitleToLocation: false, altitude: 100, poleVisible: true, poleColor: '#94a3b8',
      };
      const { items: _items, itemOrder: _order, ...rest } = toProjectDocument(createProject());
      const callout = calloutOf({
        ...rest,
        schemaVersion: 1,
        items: { c1: v1Callout },
        itemOrder: ['c1'],
      });

      expect(callout).toMatchObject({
        styleId: 'leader-line',
        content: { title: 'Harbour', subtitle: 'Old town' },
        binding: { lngLat: [0, 0.0001] },
        startTime: 4,
        endTime: 6,
        offset: [70, -90],
        settings: leaderLineStyle.defaultSettings,
        transition: { enter: 'auto', exit: 'auto' },
      });
    });
  });
});
