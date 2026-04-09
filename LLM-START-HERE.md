# LLM-START-HERE.md — Developer & AI Guide to li'l Mappo

Welcome to **li'l Mappo**, a cinematic map animation and export tool. This document provides a high-level technical map of the codebase, its architecture, and the mental model required to work with it effectively.

## 1. Project Identity & Purpose
**li'l Mappo** (`http://mappo.lazycatto.tech/`) is a browser-based "motion graphics" tool specifically for maps. Users can:
- **Import** route data (GPX/KML).
- **Plan Routes**: Automatically generate car, walking, or 3D flight paths using Mapbox Directions and Great Circle math. Features a **unified Route Planning interface** shared between the floating Toolbar (for new drafts) and the Inspector (for existing items).
- **Interactive Callouts & Boundaries**: A premium, search-based placement workflow. Users can search for locations, select from animated dots, or "Pick on Map." Features a **unified Boundary drafting tool** within the Toolbar for searching, styling, and previewing polygons before they are added to the timeline.
- **Interactive Search**: A unified geocoding system (`SearchField.tsx` for points, `BoundarySearch.tsx` for polygons) with **viewport-proximity bias**. Uses the Mapbox Search Box API for improved POI coverage and session-based pricing.
- **Manual Picking & Move Mode**: High-precision "Pick on Map" (Crosshair) mode for setting coordinates directly on the terrain. Existing items also support a **"Move Mode"** for manual repositioning via map clicks.
- **Annotate** with 3D callout cards.
- **Choreograph** camera movements using a keyframe-based timeline.
- **Save & Manage** multiple projects locally via an IndexedDB-powered library, or cloud-sync via Supabase (authenticated users).
- **Export**: Projects as `.lilmap` files or high-quality MP4 videos. Render jobs tracked in user account.
- **User Accounts**: Supabase-powered authentication with account settings, credits tracking, and render job history.
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
- **Persistence**: IndexedDB (for the project library) + Supabase PostgreSQL (for user data)
- **Authentication**: Supabase Auth (email/password, OAuth)
- **Icons**: Lucide React
- **Animations**: Custom `requestAnimationFrame` loop + easing functions
- **Geospatial Tools**: `@turf/along`, `@turf/length`, `@turf/distance`, `@turf/great-circle`
- **Video Export**: `mp4-muxer` + WebCodecs API + pure Canvas 2D (for callout rendering)
- **Testing**: Vitest (Unit/Integration) and Playwright (E2E)
- **External APIs**: Mapbox Directions (v5), Mapbox Search Box API (via `@mapbox/search-js-core`), and Supabase (v2).

- **UI Components**: Standardized **Tier 1 & Tier 2 Component Library** in `src/components/ui/` (IconButton, SegmentedControl, Field, PanelHeader, etc.), built on top of **shadcn/ui v0.9+**.

---

## 3. Core Architecture
The application is built around a **state-driven animation engine**.

### 3.1 The Brain: `src/store/useProjectStore.ts`
Everything lives in a single Zustand store. The `Project` type (persisted to disk) contains only essential animation data. Transient UI state is stored alongside but never saved.

**Persisted (Project):**
- `items`: A record of all timeline elements (Routes, Boundaries, Callouts, Camera).
- `itemOrder`: Display order of timeline items.
- `duration`, `fps`, `resolution`: Export settings.
- `projection`, `lightPreset`: Environment settings.
- `starIntensity`, `fogColor`: Atmosphere customization.
- `terrainExaggeration`: Terrain elevation multiplier.
- `mapCenter`: Current viewport center (for search proximity bias).
- `customMapStyleUrl`, `customMapStyleLabel`: Custom map style support (future feature).

**Transient (UI State — NOT persisted):**
- `mapStyle`: Always defaults to `'standard'` on app load; resets when loading a project.
- `labelVisibility`: Label group toggle state; resets to empty object on project load.
- `playheadTime`, `isPlaying`, `isScrubbing`: Playback position and state.
- `isInspectorOpen`, `timelineHeight`: Inspector & timeline UI state.
- `detectedCapabilities`: Runtime-detected label groups for the current style.
- **Feature Toggles**: `terrainEnabled`, `buildingsEnabled`, `show3dLandmarks`, `show3dTrees`, `show3dFacades` — Reset to defaults on project load.
- **Selection State**: `selectedItemId`, `selectedKeyframeId` — Reset to null on project load.
- **UI Modes**: `isMoveModeActive`, `hideUI`, `isExporting` — Reset to defaults on project load.
- **Drafting & Picking State**: 
  - `editingRoutePoint` ('start' | 'end' | 'callout') activates the **global pick mode**. 
  - `editingItemId`: Tracks the ID of the specific item currently being geocoded or picked.
  - `draftStart`, `draftEnd`, `draftCallout`: Temporary coordinates and names for Toolbar workflows.
  - `previewRoute`, `previewBoundary`, `previewBoundaryStyle`, `draftBoundaryName`: Temporary GeoJSON and styles for routes/polygons being planned before insertion.
  - All reset to null/empty on project load.

*(Note: Component-local state (e.g., `activeDropdown`, `mobileMode` in `Toolbar.tsx`) is managed as local `useState` to prevent unnecessary global re-renders.)*

### 3.1b Authentication & User Data: `src/store/useAuthStore.ts`
Manages user authentication state and account UI visibility via Supabase.

**Auth State:**
- `user`: Current authenticated user object (converted from Supabase `User` to `AuthUser` with `id`, `email`, `displayName`, `avatarUrl`).
- `session`: Active Supabase session token.
- `isLoading`: Auth initialization state (true until `initAuth()` completes).

**Modal Visibility State:**
- `showAuthModal`, `showSettingsModal`, `showCreditsModal`, `showRendersModal`: Boolean flags controlling which account modal is open.

**Methods:**
- `initAuth()`: Called once on app mount. Hydrates session from Supabase, subscribes to auth state changes, and auto-closes auth modal on successful sign-in.
- `signOut()`: Calls Supabase auth signout; state is cleared by the `onAuthStateChange` listener.
- `openAuthModal()`, `closeAuthModal()`, etc.: Toggle modal visibility.

**Key Design**: Auth state is orthogonal to project state. Modal visibility is managed here to keep the store focused. User data (credits, subscription, render jobs) is fetched separately via React Query hooks (`useCredits()`, `useSubscription()`, `useRenderJobs()`) to enable efficient caching and refetching.

### 3.2 The Heart: `src/hooks/usePlayback.ts`
Runs the `requestAnimationFrame` loop to drive time and camera interpolation.

### 3.3 The Body: `src/components/MapViewport/MapViewport.tsx`
Handles all imperative Mapbox state and reactive layer rendering.
- **Unified Sync Engine**: Orchestrates Projection, Terrain, Atmosphere, and Config.
- **Imperative Layer Groups**: `RouteLayerGroup` and `BoundaryLayerGroup` manage Mapbox sources and layers directly. They self-subscribe to the store for playhead updates, allowing 60fps geometry animation without React re-renders.
- **Preview Layers**: `PreviewRouteLayer` and `PreviewBoundaryLayer` render draft geometries using declarative components for planning.

### 3.4 The Inspector: `src/components/Inspector/`
The right-hand properties panel uses a **delegation strategy** to maintain the Single Responsibility Principle and avoid massive "God Object" files.
- `InspectorPanel.tsx`: Acts as a slim routing shell. It reads `item.kind` and delegates rendering to isolated components (`RouteInspector.tsx`, `CalloutInspector.tsx`, `BoundaryInspector.tsx`, etc.).
- `InspectorLayout.tsx`: Provides shared architectural wrappers (`PanelWrapper`, `InspectorSection`, `ItemActions`) to ensure consistent styling, padding, and mobile drawer behavior across all inspector variants. `InspectorSection` uses standardized typography tokens matching `SectionLabel`.
- `InspectorShared.tsx`: A **modern thin barrel file** that re-exports universal primitives (Field, SectionLabel, SwitchField) directly from `src/components/ui/`. Legacy backward-compatibility aliases have been removed; developers should import directly from `ui/` or use the new standardized names.

### 3.5 Dynamic Label Capabilities System
**Goal**: Allow granular, per-style label toggling without hardcoding layer patterns. Users see exactly which labels are available for each map style.

**How it works:**
1. **Runtime Detection** (`MapViewport.tsx:detectRuntimeCapabilities()`): When a style loads, the system scans the style's actual label layers and dynamically creates label groups with formatted names.
   - Example: `country-label` → group ID `place`, label "Place Names"
   - **Standard Style Special Case**: Uses hardcoded label groups mapped to Mapbox Config API properties (since Standard uses Config API for label control).
   
2. **Capabilities Store** (`useProjectStore.ts`): `detectedCapabilities` holds the label groups for the current style.
   - Eagerly initialized with Standard's groups on app load.
   - Updated whenever a style finishes loading.
   
3. **Label Syncing** (`MapViewport.tsx:toggleFeature()`):
   - **Standard Style**: Maps label group IDs to Config API property names:
     - `'place'` → `'showPlaceLabels'` (countries, states, cities, neighborhoods)
     - `'admin'` → `'showAdminBoundaries'` (country/state borders and boundary labels)
     - `'road'` → `'showRoadLabels'` (road text and shields)
     - `'transit'` → `'showTransitLabels'`
     - `'poi'` → `'showPointOfInterestLabels'`
     - `'water'`, `'natural'`, `'building'` fall through to layer pattern matching (no Config API toggle exists)
   - **Other Styles**: Scans `getStyle().layers` and uses layer ID pattern matching.
   
4. **UI Integration** (`ProjectSettings.tsx`):
   - Shows "All On" / "All Off" buttons for quick bulk toggling.
   - Renders a switch for each label group detected in the current style.
   - Toggles update `labelVisibility` in the store, which triggers reactive sync.

**Key Design**: Label toggles are **transient UI state** (not persisted). When a project loads, all labels reset to their defaults for that style. Standard style groups are manually defined to match the Mapbox Config API surface (determined via `mapbox:configGroups` in the style schema).

---

## 4. UI Layout & Design System

### 4.1 Centralized Layout Constants (`src/constants/layout.ts`)
The application shell uses standardized margins and dimensions to ensure floating panels align perfectly:
- **`PANEL_MARGIN` (16px)**: The gutter between panels and the screen edge.
- **`PANEL_GAP` (16px)**: The vertical/horizontal air-gap between adjacent panels.
- **`RIGHT_RESERVED_DESKTOP` (352px)**: Total width reserved when the Inspector is open, used to center map-based UI (like the Toolbar or Sonner toasts).

### 4.2 UI Component Standardization (Tier 1 & Tier 2)
The UI uses a consistent "Floating Island" language across the codebase:
- **Tier 1 (Primitives)**: Found in `src/components/ui/`. Includes `IconButton.tsx` (unified square icon buttons with `toolbar`, `zen`, and `destructive` variants), `SegmentedControl.tsx` (animated tabs), and `Field.tsx` (labeled inputs).
- **Tier 2 (Composites)**: Components that combine Tier 1 primitives, such as `PanelHeader.tsx` and `ToolbarDropdownPanel.tsx`.
- **Polish**: All components use a shared CSS `glass` effect and consistent `shadow-2xl` for depth. Hover states, especially in the Project Menu and Toolbar, are meticulously tuned for visual stability.

### 4.3 Intelligent Toast Positioning (`useSonnerPosition`)
Toasts (via `Sonner`) are not tethered to corners. Instead, the `useSonnerPosition` hook (in `MapStudioEditor.tsx`) calculates their position dynamically based on `isMobile`, `isInspectorOpen`, and `timelineHeight`. This ensures toasts always appear horizontally centered in the "active map area" and don't overlap with the timeline or Inspector.

---

## 5. Toolbar & Layout Architecture

### 5.1 Mobile & Tablet Layout (`src/components/Toolbar/MobileToolbarLayout.tsx`)
Uses **mode-switching** with slide animations (not dropdowns):
- **Default**: Logo, Project menu, Add (+), Layers buttons, Play, Export, Hide UI
- **Add mode**: Route, Boundary, Callout dropdowns + Camera KF + close button
- **Layers mode**: Map style select, Terrain, Buildings toggles + close button
Tablet retains rounded borders and floating positioning despite sharing this layout.

### 5.2 Desktop Layout (`src/components/Toolbar/DesktopToolbarLayout.tsx`)
Uses inline controls and dropdowns:
- Route, Boundary, Callout always visible (Boundary/Callout in dropdown on tablet)
- Map style + Terrain/Buildings inline (or in dropdown on tablet)
- All controls visible at once; no mode-switching

### 5.3 Toolbar Helpers
- `useToolbarActions()` — Encapsulates all handlers (import, export, new project, camera KF)
- `ToolbarPrimitives.tsx` — Shared `ToolbarButton`, `ToolbarToggle`, `Divider` atoms; now backed by `IconButton` for icon-only modes.

### 5.4 Avatar Menu & Account Integration
The Toolbar's top-left now features an **Avatar Menu** (`src/components/Account/AvatarMenu.tsx`) that replaces the legacy Project menu:
- **Logged Out**: Shows "Sign In" button.
- **Logged In**: Displays user avatar with dropdown menu:
  - Account Settings (email, password, profile)
  - Credits & Subscription status
  - Render Jobs history
  - Sign Out

**Account Modals** (`src/components/Account/`):
- `AuthModal.tsx`: Sign up / sign in form with Supabase integration.
- `AccountSettingsModal.tsx`: Edit email, password, profile picture.
- `CreditsModal.tsx`: Display remaining credits and subscription tier.
- `RendersModal.tsx`: List past and in-progress render jobs with status and download links.

All modals are non-modal, floating panels that integrate seamlessly with the Toolbar's floating island aesthetic.

---

## 6. Recent Architectural Refactoring

### 6.0 User Accounts & Supabase Integration (Phase 1–3)
**Problem**: li'l Mappo needed user authentication, account management, and cloud persistence for projects and render jobs.

**Solution**: Three-phase rollout of Supabase-powered user accounts:

**Phase 1 — Avatar Menu & Account Modals** (`2cdf4c2`)
- Replaced legacy Project menu with **Avatar Menu** (`AvatarMenu.tsx`).
- Created account modal suite:
  - `AuthModal.tsx`: Sign up / sign in with email/password.
  - `AccountSettingsModal.tsx`: Edit profile, email, password.
  - `CreditsModal.tsx`: Display credits and subscription tier.
  - `RendersModal.tsx`: View render job history.
- Created `useAuthStore.ts` to manage auth state (user, session, loading, error).
- Integrated Supabase client (`src/lib/supabase.ts`).

**Phase 2 — Supabase Auth Wiring** (`c00c7bd`)
- Connected `AuthModal` to real Supabase Auth endpoints (magic link, Google OAuth, GitHub OAuth).
- Implemented session persistence and auto-login on app load via `initAuth()`.
- Created database schema migration (`supabase/migrations/001_initial_schema.sql`):
  - `credit_balance`: Track monthly and purchased render credits per user (auto-created on first sign-in via trigger).
  - `subscriptions`: Store subscription tier and status (one row per paying user; free users have no row).
  - `render_jobs`: Log all export jobs with status, resolution, FPS, GPU flag, credits cost, and output URLs.
  - `feature_votes`: Anonymous feature voting table.
- Added Row Level Security (RLS) policies to ensure users can only access their own data.
- Added custom hooks using React Query: `useCredits()`, `useSubscription()`, `useRenderJobs()` for efficient data fetching and caching.

**Phase 3 — Real Data Wiring** (`b697eb2`)
- Connected account modals to live Supabase data:
  - `AccountSettingsModal`: Displays user email and display name from Supabase Auth; includes BYOK (Bring Your Own Key) Mapbox token storage in localStorage.
  - `CreditsModal`: Fetches and displays live monthly and purchased credits from `credit_balance` table; shows renewal date and purchase CTA.
  - `RendersModal`: Lists render jobs from `render_jobs` table with real-time status (queued, rendering, done, failed); includes download links for completed renders and expiration tracking.
- Enhanced `useAuthStore` to call `initAuth()` on app mount, which hydrates session from Supabase and subscribes to auth state changes.
- Added database type definitions (`src/lib/database.types.ts`) for type safety across all queries.
- Implemented React Query caching strategy:
  - `useCredits()`: 30s stale time (credits don't change often).
  - `useSubscription()`: 60s stale time.
  - `useRenderJobs()`: 0s stale time (always refetch on manual refresh).
- All modals gracefully handle loading, error, and unauthenticated states with appropriate UI feedback.

**Key Design**: Auth state is orthogonal to project state. Users can manage accounts independently of active projects. All user data is fetched on login and cached in `useAuthStore` for fast access.

### 6.1 Label System Overhaul (Dynamic Capabilities)
**Problem**: Label toggles were hardcoded per style, duplicating layer patterns and breaking for custom styles. Standard style also had incorrect Config API property names (`showRoads` → should be `showRoadLabels`, `showPlaces` → should be `showPlaceLabels`) and was missing the `showAdminBoundaries` control, causing country names and borders to remain visible when all toggles were off.

**Solution**: Runtime detection of available labels with accurate Config API mappings.
- **`detectRuntimeCapabilities()`** scans the loaded style's actual label layers and builds label groups on-the-fly (non-Standard styles).
- **Standard Style** uses hardcoded groups mapped to verified Mapbox Config API properties (discovered via `mapbox:configGroups` in the style schema):
  - `'place'` → `'showPlaceLabels'`, `'admin'` → `'showAdminBoundaries'`, `'road'` → `'showRoadLabels'`, `'poi'` → `'showPointOfInterestLabels'`, `'transit'` → `'showTransitLabels'`
  - `'water'`, `'natural'`, `'building'` fall through to layer pattern matching (no Config API toggle exists for these)
- **`toggleFeature()`** intelligently routes to either Config API (Standard) or layer visibility (all others) based on style.
- **ProjectSettings** renders toggles dynamically based on detected capabilities.
- **UI Enhancement**: Added "All On" / "All Off" buttons for quick bulk label toggling.
- **Transient State**: Label visibility is never persisted; resets on project load.

**Transient UI State Cleanup**
Removed from `Project` type (non-persisted); now transient-only in store:
- `mapStyle` — always defaults to 'standard'
- `labelVisibility` — resets to empty object
- `playheadTime`, `isPlaying`, `isScrubbing` — playback state
- `isInspectorOpen`, `timelineHeight` — UI layout state
- `isExporting` — tracks active video export; controls `preserveDrawingBuffer`

Benefit: Save files now contain only essential animation data. UI state is always fresh on load.

### 6.2 Complexity Reduction
Several high-complexity functions have been decomposed into smaller, focused helpers:

**lineAnimation.ts**
- Extracted `interpolateCoord(a, b, frac)` helper to eliminate duplicate 3D coordinate interpolation logic.

**videoExport.ts** (Canvas Callout Rendering)
- Replaced `html2canvas` DOM parsing with pure Canvas 2D callout rendering via `renderCallout.ts`.
- Each frame, callouts are projected to screen space, animation state computed, and drawn directly to compositing canvas.
- **Performance**: <1ms per callout vs. 100–300ms per frame for html2canvas DOM re-parsing.
- Split `runExport()` into three phases: `initEncoder()`, `captureFrame()`, `finalizeExport()`.
- Main function acts as orchestrator rather than monolith.

**renderCallout.ts** (New)
- Pure Canvas 2D rendering for all 4 callout style variants (default, modern, news, topo).
- `computeCalloutAnimation()`: Computes opacity for fade in/out based on playhead time.
- `renderCalloutToCanvas()`: Main entry point; dispatches to variant-specific renderers.
- Supports pole line (dashed, with dot), shadow, text rendering, accent colors, and altitude offsets.

**MapViewport.tsx**
- Extracted `resolveClickTarget(e, editingPoint)` — resolves click to either search result or raw coordinates.
- Extracted `applyPickResult(state, editingPoint, target, updateItem)` — applies the pick to draft or existing item.
- **Picking Logic Clarity**: Coordinate resolution is separated from state updates, making the flow easier to trace.

**MapStudioEditor.tsx**
- Extracted `useSonnerPosition()` hook — calculates toast positioning based on UI state.
- Extracted `<ZenModeControls />` component — floating play/show UI buttons for zen mode.

**Toolbar.tsx** (Major architectural split)
- Extracted `useToolbarActions()` hook — contains all route/project/export business logic.
- Layout split into `<MobileToolbarLayout />` and `<DesktopToolbarLayout />`.
- Unified triggers via `<ToolbarPrimitives />` backed by `IconButton`.

**Icon Updates** (Improved Visual Clarity)
- Route: `Route` → `Navigation` (more intuitive for travel)
- Callout: `MessageSquare` → `Flag` (distinct annotation marker)
- Boundary: `MapPin` → `Hexagon` (clear polygon indicator)
- Camera Keyframe: `Crosshair` → `Video` (represents video frames)
- Export: `Video` → `Clapperboard` (more distinct for cinematic final output)

### 6.3 Responsive Layout Logic (`src/hooks/useResponsive.ts`)
Detects **Mobile (< 640px)**, **Tablet (641px - 1024px)**, and **Desktop (> 1025px)**. Allows components to switch layouts or "modes" dynamically.

### 6.3 High-Performance Imperative Sync (Zero-Re-render Architecture)
**Goal**: Achieve fluid 60fps animations for map layers and UI elements by bypassing React's reconciler during playback and scrubbing.

**Core Implementation:**
1. **Imperative Playhead (`TimelinePanel.tsx`)**: The timeline ruler diamond, track line, and time display are updated via DOM refs inside a store subscription. React is only used for the initial Layout and item CRUD.
2. **Imperative Layers (`MapViewport.tsx`)**: `RouteLayerGroup` and `BoundaryLayerGroup` use `map.addSource()` and `map.addLayer()` directly. They subscribe to the store and call `setData()` and `setPaintProperty()` imperatively.
3. **Optimized Layer Mounting**: Mount logic is gated by a parent `styleLoaded` prop but specifically avoids the `map.isStyleLoaded()` synchronous check inside sibling components to prevent sequential mount race conditions (where adding one layer dirties the style and blocks the next).
4. **Self-Subscribing Components**: `CalloutMarker` and `VehicleAnimatedLayer` subscribe to only the specific state they need (like `playheadTime`), localizing re-renders to the smallest possible sub-trees.
5. **Fast Keyboard Stepping**: Keyboard shortcuts read state imperatively via `useProjectStore.getState()` to avoid dependency-array re-render cascades.

---

## 7. Critical Implementation Details

### 7.1 Animation & Routing Logic
- **Search Box API Integration**: The app uses `@mapbox/search-js-core` (SearchBoxCore + SearchSession) for geocoding instead of the legacy Geocoding v5 API. Each search component maintains its own `SearchSession` instance for proper session scoping and automatic 300ms debouncing. The SDK handles session token lifecycle and race condition prevention internally, eliminating the need for manual `setTimeout` debounce logic. Results include improved POI coverage with `place_formatted` secondary text.
- **Shared Geocoding System**: Centralized in `src/components/Search/SearchField.tsx` and `RoutePlanner.tsx`. Supports viewport-proximity biasing for better local results.
- **Boundary Logic**: Uses Nominatim (OSM) to fetch high-quality polygons. Features a **unified drafting interface** that syncs stroke and fill colors during the search phase.
- **Callout Logic**:
  - **Topo Styling**: High-contrast variant for geographic annotations with optional coordinate/elevation metadata.
  - **Title Linking**: If `linkTitleToLocation` is enabled, the callout `title` field automatically syncs with the geocoded location name during search or map-picks.
  - **Animations**: All callouts use simple fade in/out animations (both live preview and export). No scale or slide variants are exposed in the UI.
- **3D Vehicles**: Currently **gated as a PRO feature** in the Inspector. The toggle and scale controls are visible but disabled with a high-contrast "PRO" badge to denotate advanced tiered functionality.
- **Flight Arcs**: Generated via `src/services/flightPath.ts` using `@turf/great-circle` with a parabolic altitude curve.
- **Directions**: Land-based routes use Mapbox Directions.

### 7.2 Performance Optimizations
- **preserveDrawingBuffer Optimization**: The Mapbox canvas's `preserveDrawingBuffer` is `false` during normal use for better performance, and only flips to `true` when a video export is actively running. This is controlled via the `isExporting` transient state in the store.
- **Debounced mapCenter**: Viewport updates to the Zustand store are debounced by 100ms during panning to prevent excessive UI re-renders.
- **Portal-based Popovers**: `SearchField` use Portals (via Radix Popover) to break out of `overflow-hidden` containers, enabling wide location names to display fully over the map without being clipped.

### 7.3 Video Export (`src/services/videoExport.ts`)
The export process advances time step-by-step via frame capture loop. Main function orchestrates three phases:
- **initEncoder()**: Initializes WebCodecs or MediaRecorder fallback.
- **captureFrame()**: Single frame: update playhead, drive camera, composite map canvas, render callouts via Canvas 2D, encode.
- **finalizeExport()**: Flush encoder and produce final blob.

Callouts are rendered using pure Canvas 2D (`src/services/renderCallout.ts`), eliminating the DOM-parsing overhead of `html2canvas`. Each frame, visible callouts are projected to screen coordinates and drawn directly to the compositing canvas with their animation state (opacity fade in/out). Four style variants are supported:
- **default**: Rounded rect + text
- **modern**: Pill shape + accent glow dot + 87% opacity background
- **news**: Rectangle + 5px left accent bar + uppercase bold text
- **topo**: Left border + metadata (coordinates/elevation) + accent square dot

---

## 8. Common Gotchas
- **Sync Engine Exposure**: The Mapbox Sync Engine is exposed on the map instance as `_syncRef` to allow the Export Engine to force-synchronize styles during frame capture.
- **Move Mode Persistence**: During "Pick on Map" or "Move Mode", input fields pulse and display "Click on map..." while disabling standard text input.
- **Scrollbar Aesthetics**: System-native scrollbars are hidden in search suggestions and routing menus via CSS (`scrollbar-width: none`) to maintain a clean aesthetic.
- **Search Box API Session Pricing**: The Search Box API uses session-based pricing. Search result suggestions don't include coordinates, so animated preview dots on the map are not feasible. Users interact with suggestions directly in the dropdown.

---

*This guide is maintained for AI agents and human developers alike. If you change a core architectural pattern, please update this file.*
