# LLM-START-HERE.md — Developer & AI Guide to li'l Mappo

Welcome to **li'l Mappo**, a cinematic map animation and export tool. This document provides a high-level technical map of the codebase, its architecture, and the mental model required to work with it effectively.

## 1. Project Identity & Purpose
**li'l Mappo** is a browser-based "motion graphics" tool specifically for maps. Users can:
- **Import** route data (GPX/KML).
- **Lookup** and highlight place boundaries (via Nominatim).
- **Annotate** with 3D callout cards.
- **Choreograph** camera movements using a keyframe-based timeline.
- **Export** the final result as a high-quality MP4 video.

The UI is inspired by video editors like After Effects or Keynote, but tailored for geospatial storytelling.

---

## 2. Tech Stack
- **Framework**: React 18+ (Vite)
- **State Management**: Zustand
- **Map Engine**: Mapbox GL JS v3 (via `react-map-gl/mapbox`)
- **Animations**: Custom `requestAnimationFrame` loop + easing functions
- **Geospatial Tools**: `@turf/along`, `@turf/length`, `@turf/distance`
- **Video Export**: `mp4-muxer` + WebCodecs API (for H.264)
- **UI Components**: Tailwind CSS 4 + Radix UI (shadcn/ui style)

---

## 3. Core Architecture
The application is built around a **state-driven animation engine**.

### 3.1 The Brain: `src/store/useProjectStore.ts`
Everything lives in a single Zustand store.
- `items`: A record of all timeline elements (Routes, Boundaries, Callouts, Camera).
- `itemOrder`: Defines the "layer" order in the timeline and on the map.
- `playheadTime`: The current "now" of the animation. Changing this triggers updates across the entire app.
- `isPlaying`: Controls the playback loop.

### 3.2 The Heart: `src/hooks/usePlayback.ts`
When `isPlaying` is true, this hook runs a `requestAnimationFrame` loop that:
1. Increments `playheadTime` in the store.
2. Directly drives the Mapbox camera via `map.jumpTo()` using interpolated values from `src/engine/cameraInterpolation.ts`.

### 3.3 The Body: `src/components/MapViewport/MapViewport.tsx`
This component listens to `playheadTime` and re-renders Mapbox sources/layers.
- **Routes/Boundaries**: Use `useMemo` to compute the "partially drawn" GeoJSON based on `playheadTime` and the item's `startTime/endTime`.
- **Callouts**: Rendered as standard Mapbox `Marker` components. Altitude is simulated by a pixel offset calculated from the current zoom level and the callout's `altitude`.

---

## 4. Key Directories
- `src/store/`: State definitions and types. **Start here to understand the data model.**
- `src/engine/`: Pure mathematical logic for interpolation (camera lerps, line slicing).
- `src/components/MapViewport/`: Map rendering, layer management, and 3D effects.
- `src/components/Timeline/`: The interactive editor interface at the bottom.
- `src/components/Inspector/`: Property editors for the selected item.
- `src/services/`: External integrations (Nominatim search, GPX/KML parsing).
- `src/hooks/`: Integration glue (playback loop, map reference management).

---

## 5. Critical Implementation Details

### 5.1 Animation Logic
- **Camera**: Interpolates between keyframes. Supports `followRoute`, where the camera center tracks a route's geometry instead of a straight line.
- **Lines (Routes/Boundaries)**: Mapbox layers are "animated" by updating the `data` property of a GeoJSON source every frame. We slice the original line using Turf.js based on normalized progress $(t)$.
- **Callouts**: Animated using CSS transitions (`fadeIn`, `scaleUp`, etc.) triggered by a `phase` prop ('enter', 'visible', 'exit') derived from `playheadTime`.

### 5.2 3D Effects
- **Terrain**: Powered by `mapbox-dem`. Toggled via toolbar.
- **Altitude**: Callouts use a `Marker` with an `offset`. To keep the altitude visually consistent in 3D space, we recalculate the pixel offset whenever the zoom changes (see `CalloutMarker` in `MapViewport.tsx`).

### 5.3 Video Export (`src/services/videoExport.ts`)
The export process is **non-realtime (offline)** for maximum quality:
1. The app hides UI and resizes the map canvas.
2. It advances time step-by-step ($1/fps$).
3. After each step, it waits for the map to render (`map.once('render', ...)`).
4. It captures the canvas and encodes it using `VideoEncoder`.
5. It uses `mp4-muxer` to wrap the stream into an MP4 file.

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
5. Add it to the timeline in `src/components/Timeline/TrackList.tsx`.

### Animation & Performance
- Avoid placing too much logic in the `requestAnimationFrame` loop.
- Use `useMemo` in `MapViewport` components to ensure Mapbox source updates (`setData`) only happen when `playheadTime` has actually changed AND the item is within its active time range.
- **Never** use `map.flyTo()` during playback; always use `map.jumpTo()` to maintain master control over the camera.

### Map Layer Ordering
- Mapbox layers are added in the order they appear in the React tree.
- Use the `itemOrder` from the store to ensure layers respect the user's timeline track order.

---

## 8. Common Gotchas
- **Map Style Changes**: When changing the map style, Mapbox removes all custom sources and layers. `MapViewport.tsx` handles this via the `onLoad` (style load) event, but new layers must be aware of this lifecycle.
- **Zustand Subscriptions**: We use a manual subscription in `usePlayback` to avoid React render cycles for the camera driver, keeping the playback smooth.
- **Coordinate Systems**: Mapbox/GeoJSON uses `[lng, lat]`. Ensure consistency when passing coordinates around.

---

*This guide is maintained for AI agents and human developers alike. If you change a core architectural pattern, please update this file.*
