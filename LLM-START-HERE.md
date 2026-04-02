# LLM-START-HERE.md — Developer & AI Guide to li'l Mappo

Welcome to **li'l Mappo**, a cinematic map animation and export tool. This document provides a high-level technical map of the codebase, its architecture, and the mental model required to work with it effectively.

## 1. Project Identity & Purpose
**li'l Mappo** is a browser-based "motion graphics" tool specifically for maps. Users can:
- **Import** route data (GPX/KML).
- **Lookup** and highlight place boundaries (via Nominatim).
- **Annotate** with 3D callout cards.
- **Choreograph** camera movements using a keyframe-based timeline.
- **Save & Manage** multiple projects locally via an IndexedDB-powered library.
- **Export** projects as `.lilmap` files or high-quality MP4 videos.

The UI is inspired by video editors like After Effects or Keynote, but tailored for geospatial storytelling.

---

## 2. Tech Stack
- **Framework**: React 18+ (Vite)
- **State Management**: Zustand
- **Map Engine**: Mapbox GL JS v3 (via `react-map-gl/mapbox`)
- **Persistence**: IndexedDB (for the project library)
- **Animations**: Custom `requestAnimationFrame` loop + easing functions
- **Geospatial Tools**: `@turf/along`, `@turf/length`, `@turf/distance`
- **Video Export**: `mp4-muxer` + WebCodecs API + `html2canvas` (for markers)
- **UI Components**: Tailwind CSS 3 + Radix UI (shadcn/ui style)

---

## 3. Core Architecture
The application is built around a **state-driven animation engine**.

### 3.1 The Brain: `src/store/useProjectStore.ts`
Everything lives in a single Zustand store.
- `items`: A record of all timeline elements (Routes, Boundaries, Callouts, Camera).
- `itemOrder`: Defines the "layer" order in the timeline and on the map.
- `playheadTime`: The current "now" of the animation. Changing this triggers updates across the entire app.
- `isPlaying`: Controls the playback loop.
- **Project Settings**: Global overrides for `duration`, `fps`, `resolution`, `mapStyle`, and advanced Mapbox attributes. Organized into **General** and **Map** tabs in the Inspector. 
  - **Map Config**: Includes `projection` (Globe/Mercator), `lightPreset` (v3 Standard), `mapLanguage`, and granular toggles for labels (Roads, Places, POIs, Transit) and 3D details (Landmarks, Facades, Trees). 
  - **Atmosphere**: User-adjustable `starIntensity` and `fogColor`. Supported in both **Globe** and **Mercator** projections.
- **Loading State**: Transient `terrainLoading` and `buildingsLoading` indicators for map-heavy features.
- **Move Mode**: `isMoveModeActive` toggle allows users to manually reposition callouts on the map via drag-and-drop.

### 3.2 The Heart: `src/hooks/usePlayback.ts`
When `isPlaying` is true, this hook runs a `requestAnimationFrame` loop that:
1. Increments `playheadTime` in the store.
2. Directly drives the Mapbox camera via `map.jumpTo()` using interpolated values from `src/engine/cameraInterpolation.ts`.

### 3.3 The Body: `src/components/MapViewport/MapViewport.tsx`
This component listens to `playheadTime` and re-renders Mapbox sources/layers.
- **Universal Sync Engine**: Handles all imperative Mapbox state (Projection, Terrain, Fog, Config, and Labels) across all styles. It uses a robust, event-driven architecture listening to `style.load`, `styleimportdata` (for Standard featuresets), `sourcedata` (for terrain sources), and `idle` (for clearing loading indicators).
- **Component Lifecycle**: Critical sources (like `mapbox-dem`) and base layers (like `3d-buildings` for legacy styles) are **always mounted** in the React tree. Visibility and enablement are controlled imperatively via the Sync Engine to prevent race conditions during toggle operations.
- **Routes/Boundaries**: Use `useMemo` to compute the "partially drawn" GeoJSON based on `playheadTime` and the item's `startTime/endTime`.
- **Callouts**: Rendered as standard Mapbox `Marker` components. The marker itself is anchored to the ground (`offset: [0,0]`); the 3D altitude is simulated by the internal `CalloutCard` layout which grows a "pole" upwards to push the card into the sky.

---

## 4. Key Directories
- `src/store/`: State definitions and types. **Start here to understand the data model.**
- `src/engine/`: Pure mathematical logic for interpolation (camera lerps, line slicing).
- `src/components/MapViewport/`: Map rendering, layer management, and 3D effects.
- `src/components/Timeline/`: The interactive track-based editor (primarily `TimelinePanel.tsx`).
- `src/components/Inspector/`: Property editors for the selected item.
- `src/components/ProjectLibrary/`: Local project management interface.
- `src/components/ExportModal/`: Interface for configuring and running MP4 exports.
- `src/services/`: External integrations (Nominatim search, GPX/KML parsing, IndexedDB, Video Encoding).
- `src/hooks/`: Integration glue (playback loop, map reference management).

---

## 5. Critical Implementation Details

### 5.1 Animation Logic
- **Camera**: Interpolates between keyframes. Supports `followRoute`, where the camera center tracks a route's geometry instead of a straight line.
- **Lines (Routes/Boundaries)**: Mapbox layers are "animated" by updating the `data` property of a GeoJSON source every frame.
  - **Routes**: Use `getAnimatedLine` to slice the geometry from $0$ to $t$.
  - **Boundaries**: Support multiple `animationStyle` options (`fade`, `draw`, `trace`).
    - **Draw**: Traces the perimeter from $0$ to $t$.
    - **Trace**: A "comet" effect where a segment of `traceLength` travels along the perimeter.
    - **Geometry Handling**: Components use `extractLineStringsFromGeometry` to handle complex MultiPolygons and interior holes.
- **Utilities**:
  - `src/engine/lineAnimation.ts`: Contains `getLineSegment` for arbitrary range slicing.
  - `src/engine/easings.ts`: Contains `getNormalizedProgress` to centralize time-to-progress logic.
  - `src/engine/geoUtils.ts`: Handles Polygon-to-LineString conversion for perimeter animation.
- **Callouts**: Animated using CSS transitions (`fadeIn`, `scaleUp`, etc.) triggered by a `phase` prop ('enter', 'visible', 'exit') derived from `playheadTime`. Supports custom **Google Fonts** via dynamic injection.

### 5.2 3D Effects & Atmosphere
- **Terrain**: Powered by `mapbox-dem`. Toggled via toolbar or Map settings. The source remains mounted; the engine retries terrain activation on every `sourcedata` event to ensure reliability.
- **Buildings (3D Details)**: Supports a hierarchical "Master Toggle" logic. In 'Standard' style, this uses `map.setConfigProperty`. For other styles, it relies on a dedicated `3d-buildings` fill-extrusion layer managed by the engine.
- **Fog & Stars**: Configures atmospheric haze and starry skies. Works seamlessly in **both Globe and Mercator**. Uses style-aware defaults (e.g., `#5d7883` for Satellite) when no override is present.
- **Projections**: Seamlessly switch between **Globe** and **Mercator**. Transition matrix overflows are prevented by imperative order-of-operations (Projection → Terrain → Fog).
- **Altitude**: Callouts use a `Marker` with a ground-locked anchor. To keep the altitude visually consistent as the user zooms, we recalculate a pixel `altitudeOffset` which drives the internal height of the card's pole. This ensures the base dot stays geographically pinned while the card floats.

### 5.4 Move Mode (Manual Positioning)
When a callout is selected and "Move Mode" is enabled:
1. The callout's 3D altitude offset is temporarily ignored.
2. A **crosshair marker** appears at the base (altitude 0) coordinate.
3. The crosshair is `draggable`. On `dragend`, the new `lngLat` is persisted to the store.
4. This allows precise positioning relative to ground features without altitude parallax interference.

### 5.5 Timeline Direct Manipulation
- **Resizing**: Items have "hidden" handles on the edges. Dragging updates `startTime` and `endTime`.
- **Moving**: Dragging the center of an item block moves the entire clip while preserving duration.
- **Keyframes**: Camera keyframes can be dragged horizontally. The store handles re-sorting as they cross.
- **Feedback**: Instant store updates ensure the Map viewport remains perfectly in sync during edits.

### 5.3 Video Export (`src/services/videoExport.ts`)
The export process is **non-realtime (offline)** for maximum quality:
1. The app hides UI and resizes the map canvas to the target resolution.
2. It advances time step-by-step ($1/fps$).
3. After each step, it waits for the map to reach an 'idle' state (`map.once('idle', ...)`) to ensure all tiles and 3D models are fully loaded.
4. It captures the map canvas.
- **Fonts**: The engine waits for `document.fonts.ready` before the first frame to ensure custom Google Fonts are rendered correctly.
5. It uses `html2canvas` to capture the DOM-based callout markers and composites them onto the frame.
6. It encodes the composite frame using `VideoEncoder` (WebCodecs).
7. It uses `mp4-muxer` to wrap the stream into an MP4 file.
8. High-quality export supports **partial range** (Start/End time) via the Export Modal.

---

## 6. External APIs & Keys
- **Mapbox Token**: Hardcoded in `src/config/mapbox.ts`.
- **Nominatim (OSM)**: Used for boundary lookups. Respect the rate limit (1 req/s).

---

## 7. Development Guidelines

### Adding a New Item Type
1. Update `src/store/types.ts` with the new item interface.
2. Add CRUD logic to `src/store/useProjectStore.ts`.
3. Create an inspector component in `src/components/Inspector/`.
4. Create a rendering component in `src/components/MapViewport/` (e.g., `NewItemLayer.tsx`).
5. Add it to the timeline in `src/components/Timeline/TimelinePanel.tsx`.

### Animation & Performance
- Avoid placing too much logic in the `requestAnimationFrame` loop.
- Use `useMemo` in `MapViewport` components to ensure Mapbox source updates (`setData`) only happen when `playheadTime` has actually changed AND the item is within its active time range.
- **Never** use `map.flyTo()` during playback; always use `map.jumpTo()` to maintain master control over the camera.

---

## 8. Common Gotchas
- **Map Style Changes**: When changing the map style, Mapbox removes all custom sources and layers. `MapViewport.tsx` handles this via the `onLoad` (style load) event, but new layers must be aware of this lifecycle.
- **Zustand Subscriptions**: We use a manual subscription in `usePlayback` to avoid React render cycles for the camera driver, keeping the playback smooth.
- **IndexedDB Serialization**: Before saving to IndexedDB, ensure the state is stripped of functions (use `JSON.parse(JSON.stringify(state))`).
- **Coordinate Systems**: Mapbox/GeoJSON uses `[lng, lat]`. Ensure consistency when passing coordinates around.
- **Imperative Mapbox State**: Always prefer controlling Mapbox features (Terrain, Fog, Base Labels) via the imperative Sync Engine rather than conditional React rendering to avoid "source not found" or "layer already exists" errors during rapid toggles.
- **Dynamic Fonts**: `src/components/FontLoader.tsx` manages Google Font injection. It deduplicates and cleans up `<link>` tags based on the active project items to prevent CSS bloat.

---

*This guide is maintained for AI agents and human developers alike. If you change a core architectural pattern, please update this file.*
