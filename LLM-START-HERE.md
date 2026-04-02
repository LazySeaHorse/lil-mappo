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
- **Zen Mode**: A "Focus" mode that hides all UI layers for an immersive, distraction-free map experience (also automatically triggered during video exports to save GPU resources).

The UI is a premium, **responsive "floating island"** design.
- **Desktop/Tablet**: High-fidelity glassmorphism with floating panels (Toolbar, Inspector, Timeline) and deep backdrop blurs.
- **Mobile**: Optimizes for touch with a pinned top bar and a **70% snap bottom-sheet (Drawer)** for property inspection. Aesthetics shift to solid, high-contrast backgrounds for better readability and performance.

---

## 2. Tech Stack
- **Framework**: React 18+ (Vite)
- **State Management**: Zustand
- **Map Engine**: Mapbox GL JS v3 (via `react-map-gl/mapbox`)
- **Persistence**: IndexedDB (for the project library)
- **Animations**: Custom `requestAnimationFrame` loop + easing functions
- **Geospatial Tools**: `@turf/along`, `@turf/length`, `@turf/distance`
- **Video Export**: `mp4-muxer` + WebCodecs API + `html2canvas` (for markers)
- **UI Components**: Modernized **shadcn/ui v0.9+** (Tailwind CSS 3 + Radix UI).
- **Notifications**: **Sonner** (replaces legacy Radix Toast).
- **Theming**: `next-themes` (supports custom light/dark modes and system sync).

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
- **Zen Mode**: `hideUI` toggle hides the floating UI layers. When active, a minimal "Show UI" and "Play" shortcut pill appears in the top-left.
- **Responsive State**: `isInspectorOpen` toggle controls the visibility of the primary property panel. On mobile, this state is synchronized with the `vaul`-powered bottom sheet.
- **Theme Sync**: Automatically toggles between `light` and `dark` themes based on the current Mapbox style (e.g., Satellite/Dark styles trigger dark mode).

### 3.2 The Heart: `src/hooks/usePlayback.ts`
When `isPlaying` is true, this hook runs a `requestAnimationFrame` loop that:
1. Increments `playheadTime` in the store.
2. Directly drives the Mapbox camera via `map.jumpTo()` using interpolated values from `src/engine/cameraInterpolation.ts`.

### 3.3 The Body: `src/components/MapViewport/MapViewport.tsx`
This component listens to `playheadTime` and re-renders Mapbox sources/layers.
- **Universal Sync Engine**: Handles all imperative Mapbox state (Projection, Terrain, Fog, Config, and Labels) across all styles. Uses a **two-effect architecture**:
  1. **Mount-once Effect**: Registered once `mapReady` is true (from `<MapGL onLoad>`). It hooks `style.load`, `styleimportdata`, `sourcedataloading`, `sourcedata`, and `idle` listeners exactly once. These use a `syncRef` pattern to call the latest sync logic without re-registration.
  2. **Reactive Effect**: Calls `syncRef.current()` on every store change to ensure the map matches the UI state.
- **Initialization Gates**: 
  - `mapReady`: Set by `onLoad`. Defers all imperative listeners until the Mapbox instance is fully available.
  - `styleLoaded`: Set by `style.load` and cleared on `mapStyle` changes. Conditional rendering gates all `<Source>`/`<Layer>` children to prevent the `"Style is not done loading"` crash.
- **Reactive Loading States**: `terrainLoading` is driven by `sourcedataloading` and `sourcedata` (checking `isSourceLoaded`) for the `mapbox-dem` source. This ensures accurate spinner behavior when panning to areas with missing elevation data. Loading checks are automatically **bypassed during `isPlaying`** to prevent UI flickering.
- **Component Lifecycle**: Base layers (like `3d-buildings` for legacy styles) are mounted inside the `styleLoaded` gate. Visibility is then fine-tuned imperatively via the Sync Engine. Critical sources like `mapbox-dem` are managed **entirely imperatively** within the Sync Engine to prevent unmount crashes during style transitions. 
- **Defensive Sync**: Controls like `setLanguage` are wrapped in redundant safety checks (checking `getLanguage()` first and using isolated `try/catch`) to prevent Mapbox-internal AJAX crashes during style transitions.
- **Routes/Boundaries**: Use `useMemo` to compute the "partially drawn" GeoJSON based on `playheadTime` and the item's `startTime/endTime`.
- **Callouts**: Rendered as standard Mapbox `Marker` components. The marker itself is anchored to the ground (`offset: [0,0]`); the 3D altitude is simulated by the internal `CalloutCard` layout which grows a "pole" upwards to push the card into the sky.

---

## 4. Key Directories
- `src/store/`: State definitions and types. **Start here to understand the data model.**
- `src/engine/`: Pure mathematical logic for interpolation (camera lerps, line slicing).
- `src/components/MapViewport/`: Map rendering, layer management, and 3D effects.
- `src/components/Inspector/`: Adaptive property editors. 
  - **Shared Logic**: Uses a `PanelWrapper` to share form logic between the Desktop sidebar and the Mobile drawer.
  - **Mobile Physics**: Implements a `vaul` drawer with **Snap Points `[0.7, 1]`**. It opens at 70% height, expands to full-screen on swipe-up, and dismisses on swipe-down.
  - **Aesthetic Shift**: On mobile, backdrop blurs are removed in favor of a solid, "Pure White" background to ensure buttery-smooth animations and zero gesture lag.
  - **Organization**: Uses shadcn's `Accordion` to group related properties (Position, Timing, Style).
  - **Custom Controls**: Features high-fidelity components like `SliderField`, `Toggle`, and a custom `InputColor` swatch with circular swatches.
  - **Sticky Footer**: Ensures "Delete" and "Save" actions are always reachable regardless of scroll depth.
- **`src/components/ui/`**: A comprehensive library of modern, high-fidelity UI components based on **shadcn/ui**.
- `src/components/Timeline/`: The interactive track-based editor (`TimelinePanel.tsx`). 
  - **Features**: Vertical resizability (click-drag top edge), vertical scroll isolation, and a unified top-ruler scrubber with a protruding playhead.
- `src/components/Toolbar/`: Breakpoint-aware command pill. 
  - **Desktop/Tablet**: Unified horizontal toolbar with icon-only buttons.
  - **Mobile**: Consolidates secondary actions into `Add` and `Display` dropdown menus to maximize available map real estate. Replaces wide selectors (like Map Style) with compact icons.
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
- **Terrain**: Powered by `mapbox-dem`. Toggled via toolbar or Map settings. To ensure stability, the `mapbox-dem` source is **added imperatively** by the Sync Engine only when terrain is enabled. This avoids the "Source cannot be removed while terrain is using it" crash that occurs if a React-managed source unmounts before the terrain property is cleared. The engine uses source-specific handlers to drive a reactive loading spinner. These handlers use **defensive existence checks** (`getSource`) before querying loading status to prevent crashes during style transitions. For stability, **terrain and 3D buildings are automatically reset to `false`** when switching map styles or importing files.
- **Buildings (3D Details)**: Supports a hierarchical "Master Toggle" logic. In 'Standard' style, this uses `map.setConfigProperty`. For other styles, it relies on a dedicated `3d-buildings` fill-extrusion layer managed by the engine. 
- **Fog & Stars**: Configures atmospheric haze and starry skies. Works seamlessly in **both Globe and Mercator**. Uses style-aware defaults (e.g., `#5d7883` for Satellite) when no override is present. Config is re-applied after every style switch to prevent property loss.
- **Projections**: Seamlessly switch between **Globe** and **Mercator**. Transition matrix overflows are prevented by imperative order-of-operations (Projection → Terrain → Fog).
- **Altitude**: Callouts use a `Marker` with a ground-locked anchor. To keep the altitude visually consistent as the user zooms, we recalculate a pixel `altitudeOffset` which drives the internal height of the card's pole. This ensures the base dot stays geographically pinned while the card floats.

### 5.4 Move Mode (Manual Positioning)
When a callout is selected and "Move Mode" is enabled:
1. The callout's 3D altitude offset is temporarily ignored.
2. A **crosshair marker** appears at the base (altitude 0) coordinate.
3. The crosshair is `draggable`. On `dragend`, the new `lngLat` is persisted to the store.
4. This allows precise positioning relative to ground features without altitude parallax interference.

### 5.5 Timeline Direct Manipulation
- **Resizing Panel**: Users can drag the top edge of the timeline panel to change its height. The panel height is mathematically capped to the current number of tracks.
- **Scrolling**: Uses `ScrollArea` for both vertical (tracks) and horizontal (time) navigation, with sticky track labels on the left.
- **Clip Dragging**: Items have handles for updating `startTime`/`endTime`. Dragging the center moves the entire clip.
- **Keyframes**: Camera keyframes can be dragged horizontally with auto-sorting.
- **Camera Keyframes**: Unlike other items, adding a camera keyframe does **not** automatically open the inspector. This is a deliberate design choice to prevent the viewport from being obstructed on desktop or mobile, ensuring the user can accurately center the map for subsequent keyframes.
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
- **Map Style Changes**: When changing the map style, Mapbox removes all custom sources and layers. The `styleLoaded` gate in `MapViewport.tsx` automatically unmounts and remounts all `<Source>`/`<Layer>` children across style transitions. New layers must be placed inside this gate.
- **Sync Engine Stability**: Event listeners (`style.load`, `sourcedata`, etc.) are registered **once** at mount using a ref-based pattern (`syncRef`). **Never** add store dependencies to the mount-once `useEffect` — this ensures listeners aren't lost during teardown gaps.
- **State Updates during Render**: Any store updates triggered from Mapbox event listeners (like `terrainLoading`) MUST be wrapped in `requestAnimationFrame` to prevent React from throwing errors about updating parent state during a child component's render cycle.
- **Defensive Map API**: Always check Mapbox instance availability and use `try/catch` for plugin-like calls (e.g., `setLanguage`) which can throw internal network errors during transitions.
- **Zustand Subscriptions**: We use a manual subscription in `usePlayback` to avoid React render cycles for the camera driver, keeping the playback smooth.
- **IndexedDB Serialization**: Before saving to IndexedDB, ensure the state is stripped of functions (use `JSON.parse(JSON.stringify(state))`).
- **Coordinate Systems**: Mapbox/GeoJSON uses `[lng, lat]`. Ensure consistency when passing coordinates around.
- **Imperative Mapbox State**: Always prefer controlling Mapbox features (Terrain, Fog, Base Labels) via the imperative Sync Engine rather than conditional React rendering to avoid "source not found" or "layer already exists" errors. **Crucially: Never use a React `<Source>` for a source that is currently bound to the map's `terrain` property**, as React's unmount lifecycle will trigger a Mapbox error if the source is removed before terrain is set to null. Additionally, always guard calls to `isSourceLoaded` or `setLayoutProperty` with existence checks (`getSource` / `getLayer`) to prevent crashes during asynchronous style transitions.
- **UI Component Refs**: All custom UI components (Button, Toggle, DrawerOverlay, etc.) MUST be wrapped in `React.forwardRef`. Libraries like `vaul` need direct access to DOM nodes to calculate snap-point heights and attach touch-gesture observers.
- **Mobile Interaction Deadzones**: On mobile, the `TimelinePanel` is automatically hidden when the `InspectorPanel` is open. This is a critical architectural decision to prevent the timeline's z-index from interfering with the bottom-sheet's "swipe down to exit" gestures.
- **Toast Migration**: The application has fully migrated from `radix-toast` to `sonner`. Ensure all notifications use the `toast` export from `sonner`.
- **Dynamic Fonts**: `src/components/FontLoader.tsx` manages Google Font injection. It deduplicates and cleans up `<link>` tags based on the active project items to prevent CSS bloat.

---

*This guide is maintained for AI agents and human developers alike. If you change a core architectural pattern, please update this file.*
