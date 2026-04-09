# li'l Mappo (Map Animation Studio)

A technical, browser-based tool for creating cinematic map animations and exporting them as high-quality video. li'l Mappo provides a timeline-driven environment for choreographing map movements, importing route data, and annotating geographical areas with 3D callouts and boundaries.

[![redsfxfgdfbvcx.webp](https://i.postimg.cc/nhvCjTzX/redsfxfgdfbvcx.webp)](https://postimg.cc/bZwz4x1P)

## Core Features

### 1. Unified Route Planning & Import
- **GPX/KML Import**: Parse and animate existing route data.
- **Automated Routing**: Generate car, walking, or 3D flight paths using Mapbox Directions and Great Circle math.
- **Dynamic Line Animation**: Progressively draw routes over time with customizable width, color, glow effects, and tail fading.

### 2. Geographical Boundaries & Annotations
- **Boundary Lookup**: Search-based interface using Nominatim (OSM) to fetch and animate high-quality place polygons.
- **3D Callout Cards**: Position interactive 3D cards with images and synced titles. Support for "Pick on Map" mode and viewport-proximity bias.
- **Manual Picking & Move Mode**: High-precision crosshair mode for setting coordinates and repositioning items directly on the terrain.
- **Unified Drafting**: Specialized tools for routes and boundaries that allow searching, styling, and previewing before adding to the timeline.

### 3. Cinematic Camera Choreography
- **Keyframe-based Timeline**: Full control over camera center, zoom, pitch, bearing, and altitude.
- **Interpolation & Easing**: Custom easing functions (Linear, Quad, Cubic, Sine) for smooth transitions.
- **Follow Route**: Camera can be tethered to a route geometry for automated movement along a path.
- **Orbit Helper**: Automatically generate keyframes for 360-degree orbital shots.

### 4. Advanced Map Views
- **3D Terrain & Buildings**: Native support for Mapbox Terrain RGB and 3D buildings (fill-extrusion).
- **Dynamic Label Control**: A runtime capability system that detects available label groups (Places, Roads, POIs, etc.) for any style and provides granular toggles.
- **Mapbox Standard Support**: Full integration with the Mapbox Standard style, including Config API support for lighting presets and 3D feature toggles.
- **Projections**: Seamless switching between Globe and Mercator projections.
- **Zen Mode**: Focus-oriented, UI-free environment with floating controls.

### 5. Responsive "Floating Island" UI
- **Transformative Mobile Toolbar**: Adaptive layout for mobile/tablet screens with specialized 'Default', 'Add', and 'Layers' modes.
- **Non-Modal Interaction**: Drafting tools use a "floating workspace" model, allowing map interaction without closing panels.
- **Mutually Exclusive Tools**: Intelligent UI logic prevents panel overlap by ensuring only one drafting tool is active at a time.
- **Tier 1 & 2 Component Library**: Consistent design tokens using standardized primitives (IconButton, SegmentedControl, etc.) built on shadcn/ui.
- **Intelligent Toast Positioning**: Dynamic positioning for notifications (`Sonner`) to avoid overlapping with the Inspector or Timeline.

### 6. High-Quality Video Export
- **Frame-Perfect Encoding**: Non-real-time export process using the WebCodecs API and `mp4-muxer`.
- **Customizable Output**: Export at various resolutions (up to 4K) and frame rates (30/60 FPS).
- **Composite Rendering**: Orchestrated capture of Mapbox canvas and DOM overlays (markers/callouts).

## Tech Stack

- **Framework**: React 18+ (Vite)
- **State Management**: Zustand (single-store architecture)
- **Map Engine**: Mapbox GL JS v3 (via `react-map-gl/mapbox`)
- **Geospatial Processing**: Turf.js (`@turf/along`, `@turf/length`, `@turf/distance`, `@turf/great-circle`)
- **Animations**: Custom `requestAnimationFrame` loop with interpolated state and easing functions.
- **Video Export**: WebCodecs API, `mp4-muxer`, pure Canvas 2D (for callout rendering).
- **UI Components**: Tier 1 & 2 standardized component library built on shadcn/ui v0.9+ (Radix UI) and Tailwind CSS.
- **Icons**: Lucide React.
- **Persistence**: IndexedDB (local project library).
- **Testing**: Vitest (Unit/Integration) and Playwright (E2E).
- **External APIs**: Mapbox Directions (v5), Mapbox Search Box API (v1), Nominatim (OSM).

## Architecture

The application operates as a **state-driven animation engine**. A central Zustand store manages all timeline elements (Routes, Boundaries, Callouts, Camera Keyframes) and the global `playheadTime`.

### Core Components

1. **The Brain** (`src/store/useProjectStore.ts`): Manages all timeline items, drafting state, search results, and picking mode. Includes debounced `mapCenter` updates (100ms) for performance and viewport-proximity biased search.

2. **The Heart** (`src/hooks/usePlayback.ts`): Runs the main `requestAnimationFrame` loop, driving time-based interpolation and camera movement.

3. **The Body** (`src/components/MapViewport/MapViewport.tsx`): Handles imperative Mapbox state, unified sync engine (Projection, Terrain, Atmosphere), and reactive layer rendering. Features a **Zero-Re-render Architecture** that bypasses React's reconciler during playback for fluid 60fps performance.

4. **The Inspector** (`src/components/Inspector/`): Contextual properties panel using a delegation strategy. `InspectorPanel.tsx` routes to specialized inspectors (RouteInspector, BoundaryInspector, CalloutInspector), while `InspectorLayout.tsx` provides shared architectural wrappers for consistent styling.

### Performance & Sync Architecture

- **Imperative Playhead**: The timeline ruler and playback state are updated via direct DOM/Mapbox subscriptions to ensure smooth scrubbing and playback.
- **Dynamic Label Capabilities**: Runtime detection of available labels for any style (Standard or Custom), mapping them to either Mapbox Config API properties or layer visibility.
- **Optimized Layer Mounting**: Imperative layer groups (`RouteLayerGroup`, `BoundaryLayerGroup`) manage their own Mapbox lifecycles to prevent mounting race conditions.

### UI Design System

- **Layout Constants** (`src/constants/layout.ts`): Centralized margins (`PANEL_MARGIN: 16px`), gaps (`PANEL_GAP: 16px`), and reserved space (`RIGHT_RESERVED_DESKTOP: 352px`).
- **Tier 1 Primitives** (`src/components/ui/`): Standardized components like `IconButton`, `SegmentedControl`, `Field`, with consistent glassmorphism and `shadow-2xl` styling.
- **Tier 2 Composites**: Higher-level components combining primitives (e.g., `PanelHeader`, `ToolbarDropdownPanel`).
- **Responsive Layouts**: Mobile/Tablet/Desktop detection via `useResponsive.ts` enables mode-switching toolbar on mobile (Default/Add/Layers modes) and inline controls on desktop.

### Recent Architectural Improvements

- **Canvas-Based Callout Rendering**: Pure Canvas 2D rendering for all 4 callout variants (Default, Modern, News, Topo), reducing per-frame overhead from 100ms+ to <1ms.
- **Decomposed Logic**: High-complexity systems like video export and the toolbar have been refactored into focused hooks (`useToolbarActions`, `usePlayback`) and standalone services.
- **Icon Updates**: Modernized icon set (Navigation, Flag, Hexagon, Clapperboard) for better visual semantics.

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

### Key Implementation Details

- **Unified Geocoding**: Powered by the **Mapbox Search Box API**, featuring viewport-proximity biasing and session-based pricing for high-quality POI coverage.
- **Boundary Drafting**: Unified interface for searching, styling (stroke/fill colors), and previewing polygons before timeline insertion.
- **Callout Animations**: Simple fade in/out (both live preview and export). Topo variant supports coordinate/elevation metadata with optional title-location linking.
- **3D Vehicles**: Gated as a **PRO feature** with dedicated UI badges and subscription checks.
- **Flight Arcs**: Generated via `flightPath.ts` using `@turf/great-circle` with parabolic altitude curve.
- **Performance**: Debounced mapCenter (100ms), `preserveDrawingBuffer` optimization during export, and zero-re-render imperative syncing.

### Common Gotchas

- **Map Dot Stability**: Search result dots only re-search when query changes or map center stabilizes (100ms debounce).
- **Sync Engine Exposure**: Mapbox Sync Engine exposed as `_syncRef` on map instance for export frame capture.
- **Move Mode Persistence**: Input fields pulse and display "Click on map..." while in pick/move mode.
- **Scrollbar Aesthetics**: System scrollbars hidden in search/routing menus via CSS for clean appearance.