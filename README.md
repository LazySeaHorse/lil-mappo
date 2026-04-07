# li'l Mappo (Map Animation Studio)

A technical, browser-based tool for creating cinematic map animations and exporting them as high-quality video. li'l Mappo provides a timeline-driven environment for choreographing map movements, importing route data, and annotating geographical areas with 3D callouts and boundaries.

[![erfgds.webp](https://i.postimg.cc/j5tDHKF6/erfgds.webp)](https://postimg.cc/rdZyc6cz)

## Core Features

### 1. Unified Route Planning & Import
- **GPX/KML Import**: Parse and animate existing route data.
- **Automated Routing**: Generate car, walking, or 3D flight paths using Mapbox Directions and Great Circle math.
- **Dynamic Line Animation**: Progressively draw routes over time with customizable width, color, glow effects, and tail fading.

### 2. Geographical Boundaries & Annotations
- **Boundary Lookup**: Search-based interface using Nominatim (OSM) to fetch and animate high-quality place polygons.
- **3D Callout Cards**: Position interactive 3D cards with images and synced titles. Support for "Pick on Map" mode and viewport-proximity bias.
- **Manual Picking & Move Mode**: High-precision crosshair mode for setting coordinates and repositioning items directly on the terrain.

### 3. Cinematic Camera Choreography
- **Keyframe-based Timeline**: Full control over camera center, zoom, pitch, bearing, and altitude.
- **Interpolation & Easing**: Custom easing functions (Linear, Quad, Cubic, Sine) for smooth transitions.
- **Follow Route**: Camera can be tethered to a route geometry for automated movement along a path.
- **Orbit Helper**: Automatically generate keyframes for 360-degree orbital shots.

### 4. Advanced Map Views
- **3D Terrain & Buildings**: Native support for Mapbox Terrain RGB and 3D buildings (fill-extrusion).
- **Projections**: Seamless switching between Globe and Mercator projections.
- **Zen Mode**: Focus-oriented, UI-free environment.

### 5. Responsive "Floating Island" UI
- **Mode-Switching Mobile Toolbar**: Adaptive layout for mobile/tablet screens with specialized 'Default', 'Add', and 'Layers' modes.
- **Mutually Exclusive Tools**: UI logic prevents overlapping panels by ensuring only one active drafting tool at a time.
- **Tier 1 & 2 Component Library**: Consistent design tokens using standardized primitives (IconButton, SegmentedControl, etc.).

### 6. High-Quality Video Export
- **Frame-Perfect Encoding**: Non-real-time export process using the WebCodecs API and `mp4-muxer`.
- **Customizable Output**: Export at various resolutions (up to 4K) and frame rates (30/60 FPS).
- **Composite Rendering**: Orchestrated capture of Mapbox canvas and DOM overlays (markers/callouts).

## Tech Stack

- **Framework**: React 18+ (Vite)
- **State Management**: Zustand (single-store architecture)
- **Map Engine**: Mapbox GL JS v3 (via `react-map-gl/mapbox`)
- **Geospatial Processing**: Turf.js (`@turf/along`, `@turf/length`, `@turf/distance`, `@turf/great-circle`)
- **Animations**: Custom `requestAnimationFrame` loop with interpolated state.
- **Video Export**: WebCodecs API, `mp4-muxer`, `html2canvas`.
- **UI Components**: shadcn/ui v0.9+ (Radix UI), Tailwind CSS.
- **Icons**: Lucide React.
- **Persistence**: IndexedDB (local project library).
- **Testing**: Vitest (Unit/Integration) and Playwright (E2E).
- **External APIs**: Mapbox Directions/Geocoding (v5), Nominatim (OSM).

## Architecture

The application operates as a **state-driven animation engine**. A central Zustand store manages all timeline elements (Routes, Boundaries, Callouts, Camera Keyframes) and the global `playheadTime`.

1. **The Brain**: `useProjectStore.ts` handles the heavy lifting of state synchronization, drafting states, and geocoding results.
2. **The Heart**: `usePlayback.ts` runs the main animation loop, driving time-based interpolation of all items.
3. **The Body**: `MapViewport.tsx` handles imperative Mapbox state, terrain sync, and reactive layer rendering.
4. **The Inspector**: Contextual properties panel using a delegation strategy to manage individual item types (Route, Boundary, Callout).

## Development

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```