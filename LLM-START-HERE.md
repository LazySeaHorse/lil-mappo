# LLM-START-HERE.md — Developer & AI Guide to li'l Mappo

Welcome to **li'l Mappo**, a cinematic map animation and export tool. This document provides a high-level technical map of the codebase, its architecture, and the mental model required to work with it effectively.

## 1. Project Identity & Purpose
**li'l Mappo** is a browser-based "motion graphics" tool specifically for maps. Users can:
- **Import** route data (GPX/KML).
- **Plan Routes**: Automatically generate car, walking, or 3D flight paths using Mapbox Directions and Great Circle math. Features a **unified Route Planning interface** shared between the floating Toolbar (for new drafts) and the Inspector (for existing items).
- **Interactive Callouts & Boundaries**: A premium, search-based placement workflow. Users can search for locations, select from animated dots, or "Pick on Map." Features a **unified Boundary drafting tool** within the Toolbar for searching, styling, and previewing polygons before they are added to the timeline.
- **Interactive Search**: A unified geocoding system (`SearchField.tsx` for points, `BoundarySearch.tsx` for polygons) with **viewport-proximity bias**. Includes animated geocoding dots that are **fully interactive**.
- **Manual Picking**: High-precision "Pick on Map" (Crosshair) mode for setting coordinates directly on the terrain.
- **Annotate** with 3D callout cards.
- **Choreograph** camera movements using a keyframe-based timeline.
- **Save & Manage** multiple projects locally via an IndexedDB-powered library.
- **Export**: Projects as `.lilmap` files or high-quality MP4 videos.
- **Zen Mode**: Focus mode for immersive map experience.

The UI is a premium, **responsive "floating island"** design.
- **Transformative Mobile Toolbar**: On mobile devices, the toolbar switches between **'Default', 'Add', and 'Layers' modes**. This "mode-switching" layout slides in specialized toolsets, replacing standard dropdowns to maximize screen space while ensuring a focused experience.
- **Mutually Exclusive Tools**: The 3 "Add" tools (Route, Callout, Boundary) are **controlled components**. Opening one automatically closes any other open "Add" tool, preventing overlapping panels and UI clutter.
- **Non-Modal Interaction**: The Toolbar routing, callout, and boundary tools are **non-modal and persistent**. They use `onPointerDownOutside` overrides to stay open during map interaction, allowing for a "floating workspace" feel.
- **Professional Aesthetics**: Features synchronized design tokens and glassmorphism across all panels. Headers use `SectionLabel` (shared), and components like `ToolbarDropdownPanel` feature `rounded-2xl` corners with heavy `shadow-2xl` support.

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
- **UI Components**: Standardized **Tier 1 & Tier 2 Component Library** in `src/components/ui/` (IconButton, SegmentedControl, Field, PanelHeader, etc.), built on top of **shadcn/ui v0.9+**.

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
- **Drafting & Preview State**: 
  - `previewRoute` and `previewBoundary`: Store temporary GeoJSON for routes/polygons currently being planned in the Toolbar before insertion.
  - `previewBoundaryStyle`: Captures colors and animation styles selected during the boundary drafting phase.
- **Zen Mode**: `hideUI` toggle hides the floating UI layers.

*(Note: Transient UI state, such as `mobileMode` and `activeDropdown` for mutually exclusive menus, is intentionally kept out of the global store and is managed as local `useState` within `Toolbar.tsx` to prevent unnecessary global re-renders and maintain component isolation.)*

### 3.2 The Heart: `src/hooks/usePlayback.ts`
Runs the `requestAnimationFrame` loop to drive time and camera interpolation.

### 3.3 The Body: `src/components/MapViewport/MapViewport.tsx`
Handles all imperative Mapbox state and reactive layer rendering.
- **Unified Sync Engine**: Orchestrates Projection, Terrain, Atmosphere, and Config.
- **SearchResultsLayer**: Renders animated geocoding previews for points. Features an **expansion pulse effect** on hover.
- **Preview Layers**: `PreviewRouteLayer` and `PreviewBoundaryLayer` render draft geometries for items currently being planned in the Toolbar.

### 3.4 The Inspector: `src/components/Inspector/`
The right-hand properties panel uses a **delegation strategy** to maintain the Single Responsibility Principle and avoid massive "God Object" files.
- `InspectorPanel.tsx`: Acts as a slim routing shell. It reads `item.kind` and delegates rendering to isolated components (`RouteInspector.tsx`, `CalloutInspector.tsx`, `BoundaryInspector.tsx`, etc.).
- `InspectorLayout.tsx`: Provides shared architectural wrappers (`PanelWrapper`, `InspectorSection`, `ItemActions`) to ensure consistent styling, padding, and mobile drawer behavior across all inspector variants. `InspectorSection` uses standardized typography tokens matching `SectionLabel`.
- `InspectorShared.tsx`: A thin barrel file that re-exports universal primitives (Field, ColorPicker, SwitchField) from `ui/` while keeping Inspector-specific helpers (`InputNumber`, `SliderField`, `EasingSelect`).

---

## 5. Code Organization & Architecture

### 5.0 Recent Refactoring (High-Complexity Function Reduction)
Several high-complexity functions have been decomposed into smaller, focused helpers:

**lineAnimation.ts**
- Extracted `interpolateCoord(a, b, frac)` helper to eliminate duplicate 3D coordinate interpolation logic
- Reduced cognitive complexity by ~30%

**videoExport.ts**
- Split `runExport()` into three phases: `initEncoder()`, `captureFrame()`, `finalizeExport()`
- Main function now acts as an orchestrator rather than a monolith
- Makes encoder setup/teardown logic reusable

**MapViewport.tsx**
- Extracted `resolveClickTarget(e, editingPoint)` — resolves click to either search result or raw coordinates
- Extracted `applyPickResult(state, editingPoint, target, updateItem)` — applies the pick to draft or existing item
- `handleMapClick()` reduced from 66 to ~12 lines

**MapStudioEditor.tsx**
- Extracted `useSonnerPosition()` hook — calculates toast positioning based on UI state
- Extracted `<ZenModeControls />` component — floating play/show UI buttons for zen mode

**Toolbar.tsx** (Major refactor)
- Extracted `useToolbarActions()` hook (`src/components/Toolbar/useToolbarActions.ts`) — all route/project/export handlers
- Split layout into two components:
  - `<MobileToolbarLayout />` — mode-switching (default/add/layers) with slide animations
  - `<DesktopToolbarLayout />` — inline controls for desktop
- Created `<ToolbarPrimitives />` — shared button atoms (`ToolbarButton`, `ToolbarToggle`, `Divider`)
- Tablet now uses `MobileToolbarLayout` for consistency; retains rounded borders and margins
- Main `Toolbar` component reduced to ~120 lines (was 445)

**UI Component Library Refactor** (Standardization Phase)
- Created **7 new core primitives** in `src/components/ui/` to eliminate "~12 different button recipes" and inconsistent hover states.
- **IconButton.tsx**: Unified square icon buttons with `toolbar`, `toolbar-active`, `zen`, and `destructive` variants.
- **SegmentedControl.tsx**: Animated tab-like toggle groups used for travel modes and UI tabs.
- **Field.tsx**: Canonical form primitives including `Field` (vertical label/control), `SectionLabel` (all-caps headers), and `SwitchField`.
- **PanelHeader.tsx** & **ToolbarDropdownPanel.tsx**: Standardized the "floating island" dropdown shell used by all Add tools, including glassmorphism and mobile alignment.
- **ProBadge.tsx**: Unified "PRO" and "Status" pills.
- Transformed **InspectorShared.tsx** into a re-export barrel to ensure all panels use these new universal design tokens.

**Icon Updates** (Improved Visual Clarity)
- Route: `Route` → `Navigation` (more intuitive for travel)
- Callout: `MessageSquare` → `Flag` (distinct annotation marker)
- Boundary: `MapPin` → `Hexagon` (clear polygon indicator)
- Camera Keyframe: `Crosshair` → `Video` (represents video frames)

## 5. Critical Implementation Details

### 5.1 Animation & Routing Logic
- **Shared Geocoding System**: Centralized in `src/components/Search/SearchField.tsx` (for points) and `BoundarySearch.tsx` (for Nominatim-based polygons). Use shared UI patterns to avoid duplication.
- **Boundary Logic**: Uses Nominatim (OSM) to fetch high-quality polygons. Features a **unified drafting interface** that syncs stroke and fill colors during the search phase.
- **Callout Logic**:
  - **Topo Styling**: The default variant for new callouts, emphasizing high-contrast geographic data.
  - **Title Linking**: Callouts store a `linkTitleToLocation` boolean. If true, any change to the location (via search or map-pick) automatically refreshes the `title` field with the location name.
- **3D Vehicles**: Currently **gated as a PRO feature** in the Inspector. The toggle and scale controls are visible but disabled with a high-contrast "PRO" badge to denotate advanced tiered functionality.
- **Flight Arcs**: Generated via `src/services/flightPath.ts` using `@turf/great-circle` with a parabolic altitude curve.
- **Directions**: Land-based routes use Mapbox Directions.

### 5.2 Video Export (`src/services/videoExport.ts`)
The export process advances time step-by-step via frame capture loop. Main function orchestrates three phases:
- **initEncoder()**: Initializes WebCodecs or MediaRecorder fallback
- **captureFrame()**: Single frame: update playhead, drive camera, composite map + callouts, encode
- **finalizeExport()**: Flush encoder and produce final blob

---

## 8. Toolbar & Layout Architecture

### Mobile & Tablet Layout (`src/components/Toolbar/MobileToolbarLayout.tsx`)
Uses **mode-switching** with slide animations (not dropdowns):
- **Default**: Logo, Project menu, Add (+), Layers buttons, Play, Export, Hide UI
- **Add mode**: Route, Boundary, Callout dropdowns + Camera KF + close button
- **Layers mode**: Map style select, Terrain, Buildings toggles + close button
Tablet retains rounded borders and floating positioning despite sharing this layout.

### Desktop Layout (`src/components/Toolbar/DesktopToolbarLayout.tsx`)
Uses inline controls and dropdowns:
- Route, Boundary, Callout always visible (Boundary/Callout in dropdown on tablet)
- Map style + Terrain/Buildings inline (or in dropdown on tablet)
- All controls visible at once; no mode-switching

### Toolbar Helpers
- `useToolbarActions()` — Encapsulates all handlers (import, export, new project, camera KF)
- `ToolbarPrimitives.tsx` — Shared `ToolbarButton`, `ToolbarToggle`, `Divider` atoms; now backed by `IconButton` for icon-only modes.

## 8. Common Gotchas
- **Map Dot Stability**: Search results (dots) are decoupled from the high-frequency camera movement. They only re-search when the query string changes or the map center stabilizes (100ms debounce). This prevents flickering during rapid panning.
- **No-Clip Search Results**: `SearchField` uses a **Portal-based Popover** for its results. This allows the search list to break out of the parent container's `overflow-hidden` constraints, enabling wide location names to display fully over the map without being clipped by the 320px dropdown boundary.
- **Sticky Crosshairs**: During "Pick on Map" mode, the input fields pulse and display "Click on map..." while disabling standard text input to guide the user.
- **Sync Engine Exposure**: The Sync Engine is exposed on the map instance as `_syncRef` to allow the Export Engine to force-synchronize styles during frame capture.
- **Scrollbar Aesthetics**: System-native scrollbars are hidden in search suggestions and routing menus via CSS (`scrollbar-width: none`) to maintain a clean, app-like aesthetic without breaking scroll functionality.
- **Picking Logic Clarity**: `resolveClickTarget()` and `applyPickResult()` in MapViewport separate coordinate resolution from state updates, making the picking flow easier to trace and test.

---

*This guide is maintained for AI agents and human developers alike. If you change a core architectural pattern, please update this file.*
