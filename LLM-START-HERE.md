# LLM-START-HERE.md — Developer & AI Guide to li'l Mappo

Welcome to **li'l Mappo**, a cinematic map animation and export tool. This document provides a high-level technical map of the codebase, its architecture, and the mental model required to work with it effectively.

## 1. Project Identity & Purpose
**li'l Mappo** is a browser-based "motion graphics" tool specifically for maps. Users can:
- **Import** route data (GPX/KML).
- **Plan Routes**: Automatically generate car, walking, or 3D flight paths using Mapbox Directions and Great Circle math. Features a **unified Route Planning interface** shared between the floating Toolbar (for new drafts) and the Inspector (for existing items).
- **Interactive Callouts**: A premium, search-based callout placement workflow. Users can search for locations, select from animated map-based dots, or "Pick on Map." Callouts default to a professional **Topo Data** style and can **link titles to locations** (automatically syncing the card title with the geographic name).
- **Interactive Search**: A unified geocoding system (`SearchField.tsx`) with **viewport-proximity bias**. Includes animated map-based preview dots that are **fully interactive**—users can click a dot directly on the map to instantly set it as a coordinate for routes or callouts.
- **Manual Picking**: High-precision "Pick on Map" (Crosshair) mode for setting coordinates directly on the terrain.
- **Annotate** with 3D callout cards.
- **Choreograph** camera movements using a keyframe-based timeline.
- **Save & Manage** multiple projects locally via an IndexedDB-powered library.
- **Export**: Projects as `.lilmap` files or high-quality MP4 videos.
- **Zen Mode**: Focus mode for immersive map experience.

The UI is a premium, **responsive "floating island"** design.
- **Non-Modal Interaction**: The Toolbar routing and callout tools are **non-modal and persistent**. They use `onPointerDownOutside` overrides to stay open during map interaction, allowing for a "floating workspace" feel.
- **Professional Aesthetics**: Features synchronized design tokens across all panels. Routing and Callout buttons use a clean, high-contrast `text-foreground` style to match the Boundary tools.

---

## 2. Tech Stack
- **Framework**: React 18+ (Vite)
- **State Management**: Zustand
- **Map Engine**: Mapbox GL JS v3 (via `react-map-gl/mapbox`)
- **Persistence**: IndexedDB (for the project library)
- **Animations**: Custom `requestAnimationFrame` loop + easing functions
- **Geospatial Tools**: `@turf/along`, `@turf/length`, `@turf/distance`, `@turf/great-circle`
- **Video Export**: `mp4-muxer` + WebCodecs API + `html2canvas` (for markers)
- **External APIs**: Mapbox Directions (v5) and Mapbox Geocoding (v5).
- **UI Components**: Modernized **shadcn/ui v0.9+**.

---

## 3. Core Architecture
The application is built around a **state-driven animation engine**.

### 3.1 The Brain: `src/store/useProjectStore.ts`
Everything lives in a single Zustand store.
- `items`: A record of all timeline elements (Routes, Boundaries, Callouts, Camera).
- `playheadTime`: The current "now" of the animation.
- **Map Center & Proximity**: `mapCenter` is synced from the viewport and used to bias search results toward the current viewing area. To ensure smooth performance, **`mapCenter` updates are debounced by 100ms** during continuous panning.
- **Drafting State**: `draftStart`, `draftEnd`, and `draftCallout` hold temporary coordinates and names for the Toolbar workflows before they are "inserted" into the timeline.
- **Search & Picking State**: 
  - `searchResults` and `hoveredSearchResultId` drive the map-based feedback dots.
  - `editingRoutePoint` ('start' | 'end' | 'callout') activates the **global pick mode**. 
  - `editingItemId`: A generic state that tracks the ID of the specific item currently being geocoded or picked. If null, the map-click updates the Toolbar `draft` states; if set, it updates the specific timeline item.
- **Zen Mode**: `hideUI` toggle hides the floating UI layers.

### 3.2 The Heart: `src/hooks/usePlayback.ts`
Runs the `requestAnimationFrame` loop to drive time and camera interpolation.

### 3.3 The Body: `src/components/MapViewport/MapViewport.tsx`
Handles all imperative Mapbox state and reactive layer rendering.
- **Unified Sync Engine**: Orchestrates Projection, Terrain, Atmosphere, and Config.
- **SearchResultsLayer**: Renders animated geocoding previews. Features an **expansion pulse effect** on hover. Circles are interactive via `interactiveLayerIds` to support click-to-select logic.
- **PreviewRouteLayer**: Renders a "Draft" path line for routes currently being planned in the Toolbar or Inspector.

---

## 5. Critical Implementation Details

### 5.1 Animation & Routing Logic
- **Shared Geocoding System**: Centralized in `src/components/Search/SearchField.tsx`. Used across the Route Planner, Callout Adder, and item Inspectors. Features:
  - **Auto-complete**: Geocoding with 400ms debounce.
  - **Coordinate Detection**: Intelligent parsing of "lat, lng" strings.
  - **Context-Aware Picking**: Dynamically updates either UI draft state or live item data based on `editingItemId`.
- **Callout Logic**:
  - **Topo Styling**: The default variant for new callouts, emphasizing high-contrast geographic data.
  - **Title Linking**: Callouts store a `linkTitleToLocation` boolean. If true, any change to the location (via search or map-pick) automatically refreshes the `title` field with the location name.
- **3D Vehicles**: Currently **gated as a PRO feature** in the Inspector. The toggle and scale controls are visible but disabled with a high-contrast "PRO" badge to denotate advanced tiered functionality.
- **Flight Arcs**: Generated via `src/services/flightPath.ts` using `@turf/great-circle` with a parabolic altitude curve.
- **Directions**: Land-based routes use Mapbox Directions.

### 5.3 Video Export (`src/services/videoExport.ts`)
The export process advances time step-by-step, Advance time -> Sync Map -> Wait for Idle -> Capture Frame.

---

## 8. Common Gotchas
- **Map Dot Stability**: Search results (dots) are decoupled from the high-frequency camera movement. They only re-search when the query string changes or the map center stabilizes (100ms debounce). This prevents flickering during rapid panning.
- **Popover Clipping**: The Toolbar popover uses `!overflow-visible` and specific width constraints (`w-fit`) to ensure search suggestions can stretch to the full width of the text without being cut off by parent container boundaries.
- **Sticky Crosshairs**: During "Pick on Map" mode, the input fields pulse and display "Click on map..." while disabling standard text input to guide the user.
- **Sync Engine Exposure**: The Sync Engine is exposed on the map instance as `_syncRef` to allow the Export Engine to force-synchronize styles during frame capture.
- **Scrollbar Aesthetics**: System-native scrollbars are hidden in search suggestions and routing menus via CSS (`scrollbar-width: none`) to maintain a clean, app-like aesthetic without breaking scroll functionality.

---

*This guide is maintained for AI agents and human developers alike. If you change a core architectural pattern, please update this file.*
