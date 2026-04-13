# LLM-START-HERE.md — Developer & AI Guide to li'l Mappo

Welcome to **li'l Mappo**, a cinematic map animation and export tool. This document provides a high-level technical map of the codebase, its architecture, and the mental model required to work with it effectively.

## 1. Project Identity & Purpose
**li'l Mappo** (`http://mappo.lazycatto.tech/`) is a browser-based "motion graphics" tool specifically for maps. Users can:
- **Import** route data (GPX/KML).
- **Plan Routes**: Automatically generate car, walking, or 3D flight paths using Mapbox Directions and Great Circle math. Features a **unified Route Planning interface** shared between the floating Toolbar (for new drafts) and the Inspector (for existing items).
- **Interactive Callouts & Boundaries**: A premium, search-based placement workflow. Users can search for locations, select from animated dots, or "Pick on Map." Features a **unified Boundary drafting tool** within the Toolbar for searching, styling, and previewing polygons before they are added to the timeline.
- **Interactive Search**: A unified geocoding system (`SearchField.tsx` for points, `BoundarySearch.tsx` for polygons) with **viewport-proximity bias**. Uses the Mapbox Search Box API for improved POI coverage and session-based pricing. Searches are **manually triggered by the Enter key** to prevent UI flickering during rapid typing.
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
- **Authentication**: Supabase Auth (email + password, Google OAuth, GitHub OAuth)
- **Data Fetching**: React Query v5 (for efficient caching of user data)
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
- `isInspectorOpen`, `timelineHeight`: Inspector & timeline UI state. Inspector starts **closed by default** on app load for a clean map-focused view; auto-opens when selecting items or loading projects.
- `isCameraEnabled`: Mute toggle for the camera track; resets to `true` on project load.
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
Manages user authentication state, account UI visibility, and checkout flow via Supabase + Dodo Payments.

**Auth State:**
- `user`: Current authenticated user object (converted from Supabase `User` to `AuthUser` with `id`, `email`, `displayName`, `avatarUrl`).
- `session`: Active Supabase session token.
- `isLoading`: Auth initialization state (true until `initAuth()` completes).

**Modal Visibility & Mode:**
- `showAuthModal`: Whether the auth modal is open.
- `authModalMode: 'signin' | 'signup'`: Distinguishes sign-in-only flow (regular user re-login) from signup flow (account creation during checkout).
- `showSettingsModal`, `showCreditsModal`, `showRendersModal`: Boolean flags for other account modals.

**Methods:**
- `initAuth()`: Called once on app mount. Hydrates session from Supabase, subscribes to auth state changes, auto-closes auth modal on successful sign-in, and resumes any pending checkout/topup from localStorage.
- `signOut()`: Calls Supabase auth signout; state is cleared by the `onAuthStateChange` listener.
- `openAuthModal()`: Opens auth modal in `'signin'` mode (standard sign-in).
- `openSignupModal()`: Opens auth modal in `'signup'` mode (account creation during checkout). Used by the checkout flow when user is unauthenticated.
- `closeAuthModal()`, and similar for other modals: Toggle visibility.
- `startCheckout(plan, quantity?)`: Initiates checkout for a subscription plan or topup. If unauthenticated, stores pending intent in localStorage and opens signup modal. If authenticated, redirects to Dodo immediately.

**Pending Checkout Persistence:**
When an unauthenticated user clicks "Subscribe" or "Top Up Credits", the intent is stored in localStorage:
- Subscription plans: `storePendingPlan(plan)` → SIGNED_IN handler → `initiateDodoCheckout(plan)`
- Topup credits: `storePendingTopup(amount)` → SIGNED_IN handler → `initiateDodoCheckout('topup', { quantity: amount })`

This persists across the password-confirm redirect cycle, ensuring the checkout resumes seamlessly after account creation.

**Key Design**: Auth state is orthogonal to project state. Modal visibility and mode are managed here to keep the store focused. User data (credits, subscription, render jobs) is fetched separately via React Query hooks (`useCredits()`, `useSubscription()`, `useRenderJobs()`) to enable efficient caching and refetching. After checkout, React Query caches are invalidated to show live provisioned data.

### 3.2 The Heart: `src/hooks/usePlayback.ts`
Runs the `requestAnimationFrame` loop to drive time and camera interpolation.
- **Camera Mute Guard**: The `driveCamera` function checks `store.isCameraEnabled` before updating the Mapbox viewState. This allows users to "mute" the camera track via the timeline "Eye" icon to preview object animations from a static or manually controlled perspective.

### 3.3 The Body: `src/components/MapViewport/`
The MapViewport is a modularized imperative engine designed for maximum stability and performance. It follows a **Delegation Architecture**.

- **Orchestrator (`MapViewport.tsx`)**: A slim shell that manages the `<MapGL />` component, lifecycle states (`mapReady`, `styleLoaded`), and coordinate centering. It delegates all business logic to dedicated hooks and sub-components.
- **Unified Sync Engine (`hooks/useMapSync.ts`)**: The core imperative bridge. Orchestrates Projection, Terrain, Atmosphere, and Config. Uses **numeric epsilon guards** and normalized color comparisons in an `idle` synchronization loop to ensure zero-flicker stability. It also manages the **Export Engine Bridge** (`_syncRef`) used for frame capture during video export.
- **Guarded Imperative Layer Groups**:
  - **`RouteLayerGroup.tsx`**: Manages Mapbox sources and layers for routes, including the **Vehicle System**. Uses **`line-trim-offset`** paint property optimization (Mapbox GL JS v3) to eliminate per-frame `setData()` calls for `draw` and `navigation` modes. **Monochromatic Sync**: Enforces that the route line, its glow, and its vehicle (if dot) all share the same primary color.
  - **`BoundaryLayerGroup.tsx`**: Manages Mapbox sources and layers for polygons/boundaries. **Monochromatic Sync**: Fill and Glow colors are locked to the stroke color. Fill opacity supports a full `0-1.0` range for a "stamp" look. Uses a shared source for stroke and a new neon-style **Glow Layer** (using `line-blur`).
  - Both components use a **Multi-Effect Strategy**:
    1. **Geometry Upload Effect**: Uploads full geometry once per route/boundary change (RouteLayerGroup) or when style changes (BoundaryLayerGroup).
    2. **Playhead Time-Guard (performance)**: Store subscription uses imperative paint/layout property updates (no `setData()` for draw/navigation routes). Prevents memory leaks and CPU-to-GPU transfer spikes.
    3. **Style-Watch Effect (liveness)**: A second `useEffect` watches style-relevant props (`color`, `width`, `startTime`, `endTime`, `easing`, `exitAnimation`) and re-applies Mapbox state when paused.
- **Callout System (`CalloutMarker.tsx` + `hooks/useCalloutAnimationState.ts` + `hooks/useCalloutAltitudeOffsets.ts`)**: Manages 3D markers, altitude offsets, and the **High-Precision Move Mode** for manual coordinate picking.
  - **Animation State Hook** (`useCalloutAnimationState.ts`): Computes visibility, animation phase, and progress for all callouts once per frame in the parent (MapViewport), avoiding per-marker playheadTime subscriptions.
  - **Altitude Offset Hook** (`useCalloutAltitudeOffsets.ts`): Computes pixel offsets for 3D altitude effects based on map zoom, updating only when zoom changes (not on every playhead frame).
  - **Decoupled Rendering**: CalloutMarker receives computed animation state as props, preventing the "playhead storm" of 60 re-renders/second per marker during playback.
- **Selector-Based Performance**: RouteLayerGroup and BoundaryLayerGroup use individual store selectors (e.g., `useProjectStore(s => s.playheadTime)`) with imperative Mapbox updates, avoiding React re-render overhead for layer data.
- **Stateless Helpers (`mapUtils.ts`)**: Centralizes logic for runtime capability detection and map-click resolution.
- **Preview Layers**: `PreviewRouteLayer` and `PreviewBoundaryLayer` render draft geometries using declarative components for planning.
- **Route Animation Types** (`item.style.animationType`): Three mutually exclusive modes per route:
  - **`draw`** (default): Line animates from start to end as time progresses. Supports exit animation (retract from tip) and trail fade. Glow and dash pattern available. **Optimization**: Uses `line-trim-offset: [drawP, 1]` to reveal the route without re-uploading geometry each frame. Full geometry is static in the Mapbox source; only the paint property trim offset changes per frame.
  - **`navigation`**: Full route is visible from the start; the passed portion erases as the playhead advances. Mirrors Google Maps navigation. Glow supported; no exit animation or dash. **Optimization**: Uses `line-trim-offset: [0, progress]` to hide the passed portion. Same static geometry + paint property strategy as draw mode.
  - **`comet`**: Only a gradient trail segment is drawn — transparent at the tail, opaque at the head. Trail length is configurable (`item.style.cometTrailLength`, 0–0.8). Uses a dedicated Mapbox source with `lineMetrics: true` and `line-gradient` paint. No glow, no dash. Vehicle/dot shows at the head if enabled. **Note**: Still uses `setData()` each frame since the visible segment spans only a portion of the full line (can't use single `line-trim-offset` to hide both ends).
  - **Exit Animations**: Both routes and boundaries support three exit modes: `none`, `reverse` (retract/undo the entry), and `fade` (global opacity transition). `comet` and `trace` styles skip exit animations as they naturally self-erase.
- **Exit Animations**: Optional animations for routes and boundaries after their `endTime`:
  - **`none`**: Item remains at its final state until explicitly removed or loop ends.
  - **`reverse`**: 
    - **Routes**: Line is erased from the starting point toward the tip over 0.5s (Eraser behavior).
    - **Boundaries**: Stroke is erased from its starting perimeter point toward the finish.
  - **`fade`**: Global opacity transition to 0 over 0.5s, regardless of entrance style.
  - Toggle found in Inspector Timing sections. Skip for self-erasing modes (comet/trace).
- **Vehicle System**: Controlled via `route.calculation.vehicle`. Independent of transport mode selection.
  - **`dot`** (default, free): Rendered as a Mapbox `circle` layer. **Monochromatic**: Color is synced to the route color with a white stroke.
  - **`car` / `plane`** (Pro): GLB model rendering. 
  - **Mode Independence**: Vehicles can be enabled for any route, including imported KML/GPX or Manual paths. Selecting 'Car' transport mode no longer hard-enforces a car model; users must toggle it on manually. "Walk" transport mode has been removed in favor of "Car" (Directions api provides similar paths).
  - Controls live in a dedicated **Vehicle** section in the Route Inspector.

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
   
3. **Label Syncing** (`hooks/useMapSync.ts:toggleFeature()`):
   - **Standard Style**: Maps label group IDs to Config API property names:
     - `'place'` → `'showPlaceLabels'` (countries, states, cities, neighborhoods)
     - `'admin'` → `'showAdminBoundaries'` (country/state borders and boundary labels)
     - `'road'` → `'showRoadLabels'` (road text and shields)
     - `'transit'` → `'showTransitLabels'`
     - `'poi'` → `'showPointOfInterestLabels'`
     - `'water'`, `'natural'`, `'building'` fall through to layer pattern matching (no Config API toggle exists)
   - **Other Styles**: Scans `getStyle().layers` once per sync cycle and reuses the result across all label groups (optimized: `map.getStyle()` is expensive, so layers are extracted before the forEach loop).
   - **Performance**: Calls to expensive operations like `map.getStyle()` are done once and cached, not once-per-label-group.
   
4. **UI Integration** (`ProjectSettings.tsx`):
   - Shows "All On" / "All Off" buttons for quick bulk toggling.
   - Renders a switch for each label group detected in the current style.
   - Toggles update `labelVisibility` in the store, which triggers reactive sync.

**Key Design**: Label toggles are **transient UI state** (not persisted). When a project loads, all labels reset to their defaults for that style. Standard style groups are manually defined to match the Mapbox Config API surface (determined via `mapbox:configGroups` in the style schema).

### 3.6 Performance Optimizations (Recent)

**Callout Marker Playhead Storm (Fixed)**
- **Problem**: CalloutMarkers previously subscribed directly to `playheadTime`, causing 60 re-renders/second per marker during playback.
- **Solution**: Computation of animation state (`visibility`, `phase`, `progress`) is now centralized in MapViewport via `useCalloutAnimationState` hook, then passed as props to individual markers.
- **Result**: Markers only re-render when their specific animation state changes, not on every playhead frame.

**Map Style Queries in Loops (Fixed)**
- **Problem**: `toggleFeature()` called `map.getStyle()` (expensive serialization) inside a forEach loop over label groups, causing 5-10 serializations per sync cycle.
- **Solution**: Extract layers once before the loop in `useMapSync.ts`, pass as parameter to `toggleFeature()`.
- **Result**: `map.getStyle()` now called once per sync instead of N times.

**Altitude Offset Calculations (Fixed)**
- **Problem**: Altitude pixel offset recalculated on every frame due to playhead storm subscription.
- **Solution**: Dedicated `useCalloutAltitudeOffsets` hook that only recalculates when map zoom changes, not on every playhead frame.
- **Result**: Expensive zoom/metersPerPixel math runs only when necessary.

**Boundary Layer Lifecycle & Sync (Fixed)**
- **Problem**: `BoundaryLayerGroup` had incorrect layer ordering (adding glow before stroke), leading to persistent Mapbox errors. It also called `setData` twice per frame on a shared source and allocated new GeoJSON objects every frame during playback.
- **Solution**: 
  1. Reordered `addLayer` calls (stroke then glow).
  2. Implemented explicit glow layer cleanup.
  3. Optimized `updateBoundary` to perform a single `setData` on the shared source.
  4. Moved GeoJSON feature creation inside change guards to reduce GC pressure.
- **Result**: Elimination of console error flood and significantly smoother boundary animations (lower CPU/GPU overhead).

**Dead Code Cleanup**
- Removed unused files: `NavLink.tsx`, `use-mobile.tsx`, `geocoding.ts` (empty barrel), `App.css` (unused Vite boilerplate).

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
  - Account Settings (email, password, profile, BYOK Mapbox token)
  - Credits & Subscription status
  - Render Jobs history
  - Sign Out

**Account Modals** (`src/components/Account/`):
- `AuthModal.tsx`: Sign in form with email + password, Google OAuth, GitHub OAuth. Includes "View plans" CTA for new users.
- `AccountSettingsModal.tsx`: Edit email, password, profile picture. BYOK Mapbox token storage in localStorage.
- `CreditsModal.tsx`: Tabbed interface with Subscriptions and Top Up Credit tabs. Shows current balance, tier info, and plan comparison cards.
- `RendersModal.tsx`: List past and in-progress render jobs with status and download links.
- `MockCheckout.tsx`: Test-mode checkout form (TODO: replace with Dodo Payments integration). Accepts email and card details, stores pending checkout in localStorage.

**Subscription Tiers** (via `SubscriptionTiers` component):
- **Wanderer** (Free): 0 credits/mo, sequential rendering, local saves only.
- **Cartographer** ($15/mo): 500 credits/mo, 2 parallel renders, unlimited cloud saves.
- **Pioneer** ($35/mo): 2,000 credits/mo, 5 parallel renders, unlimited cloud saves.

All modals are non-modal, floating panels that integrate seamlessly with the Toolbar's floating island aesthetic.

---

## 6. Recent Architectural Refactoring

### 6.0 User Accounts & Supabase Integration (Phase 1–3) + Checkout Flow (Phase 4)
**Problem**: li'l Mappo needed user authentication, account management, cloud persistence, and a monetization system for subscription tiers.

**Solution**: Four-phase rollout of Supabase-powered user accounts and mock checkout:

**Phase 1 — Avatar Menu & Account Modals** (`2cdf4c2`)
- Replaced legacy Project menu with **Avatar Menu** (`AvatarMenu.tsx`).
- Created account modal suite:
  - `AuthModal.tsx`: Sign in with email + password, Google OAuth, GitHub OAuth.
  - `AccountSettingsModal.tsx`: Edit profile, email, password, BYOK Mapbox token.
  - `CreditsModal.tsx`: Display credits and subscription tier.
  - `RendersModal.tsx`: View render job history.
- Created `useAuthStore.ts` to manage auth state (user, session, loading, modal visibility).
- Integrated Supabase client (`src/lib/supabase.ts`).

**Phase 2 — Supabase Auth Wiring** (`c00c7bd`)
- Connected `AuthModal` to real Supabase Auth endpoints (email + password, Google OAuth, GitHub OAuth).
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

**Phase 4 — Checkout & Subscription Tiers (Mock → Real)**

*Mock Phase (obsolete):*
- Initially created `MockCheckout.tsx` component: Test-mode checkout form with email, card number, expiry, CVV fields.
- Created `mockCheckout.ts` service with `initiateMockCheckout()` and `fulfillPendingCheckout()` for localStorage-based flow.

*Production Phase — Dodo Payments Integration* (`4e91c5c`)
- **Replaced mock checkout with live Dodo Payments integration:**
  - Removed `MockCheckout.tsx` and `mockCheckout.ts`; created `checkout.ts` service with real payment flow.
  - Added two Vercel API routes:
    - `api/dodo-create-session.ts`: Authenticates via Supabase JWT, validates the plan/quantity, creates a Dodo checkout session, and returns the hosted checkout URL.
    - `api/dodo-webhook.ts`: Receives Dodo's `payment.succeeded` webhook; creates subscription records and provisions credits to `credit_balance` table.
  - Added database migration (`supabase/migrations/002_add_dodo_fields.sql`): Added `dodo_subscription_id` (unique) and `status` fields to `subscriptions` table for webhook lookups.
- **Checkout Flow (Dodo Hosted)**:
  1. User clicks "Subscribe" or "Top Up Credits" in `CreditsModal`.
  2. If signed in: `startCheckout(plan, quantity?)` calls `initiateDodoCheckout()` with access token.
  3. If not signed in: `startCheckout()` stores plan in localStorage via `storePendingPlan()` and opens `AuthModal`.
  4. `initiateDodoCheckout()` sends POST to `/api/dodo-create-session` with plan, quantity, and Bearer token.
  5. Vercel route validates JWT, creates Dodo session with metadata (supabase_uid, plan, credits for topup), and returns `checkout_url`.
  6. Browser redirects to Dodo's hosted checkout page (Dodo domain, PCI compliance, secure).
  7. After payment, Dodo sends webhook to `/api/dodo-webhook` with `payment.succeeded` event.
  8. Webhook handler:
     - Validates Dodo signature.
     - Extracts `supabase_uid`, `plan`, and `credits` from metadata.
     - For subscriptions (cartographer/pioneer): Creates row in `subscriptions` table with `dodo_subscription_id`.
     - For topups: Increments purchased credits in `credit_balance` table.
     - Supabase RLS policies ensure webhook has admin access.
  9. After payment, Dodo redirects user back to `/?checkout=success` (or error URL if cancelled).
  10. `MapStudioEditor.tsx` detects `?checkout=success` query param and shows success toast.
- **Pending Plan Persistence**: `getPendingPlan()` and `clearPendingPlan()` helpers manage localStorage across the OAuth redirect cycle.
- **Enhanced `useAuthStore.startCheckout()`**:
  - Signed-in users: Immediately redirect to Dodo.
  - Unauthenticated users: Store plan, open AuthModal, and after `SIGNED_IN` event fires (via `onAuthStateChange` listener), automatically resume checkout via `initiateDodoCheckout()`.
- **PLAN_CONFIG** in `checkout.ts`:
  - Cartographer: $15/mo, 500 credits/mo, 2 parallel renders.
  - Pioneer: $35/mo, 2000 credits/mo, 5 parallel renders.
  - Topup: $1–$200 (slider on credits modal), 100 credits per dollar.
  - Product IDs map to Dodo dashboard product entries.
- **Dodo Environment**: Currently running in `test_mode` for development; switch to live mode via env var for production.

**Key Design**: Checkout is now fully server-driven. Magic-link / OAuth sessions are persisted in localStorage, allowing checkout to resume after auth redirects. Dodo handles all payment processing and security; webhooks ensure server-side subscription provisioning. No payment card data ever touches li'l Mappo servers.

**Benefits**:
- PCI compliance via Dodo's hosted checkout.
- Automatic webhook fulfillment (no polling or manual verification).
- One-time topups decoupled from recurring subscriptions.
- Flexible metadata allows future plan variants without code changes.

**Webhook Handler Refactoring** (post-Phase 4):
- **Problem**: `api/dodo-webhook.ts` mixed billing logic (grace credits, DB updates, idempotency) with routing logic inside a 100-line switch statement. Debugging credit-provisioning logic required scrolling past unrelated payment/renewal cases.
- **Solution**: Extracted 5 discrete event handlers (`handleSubscriptionActive`, `handlePaymentSucceeded`, `handleSubscriptionRenewed`, `handleSubscriptionCancelled`, `handleSubscriptionExpired`), each responsible for one event type end-to-end. The switch statement is now a thin 10-line dispatcher.
  - Handlers throw on DB errors (caught by outer `try/catch` → 500, Dodo retries).
  - Handlers return early on "soft" failures (missing metadata, unknown product → 200, Dodo doesn't retry).
  - Idempotency rollback logic stays with each handler.
- **Benefit**: Clear entry points for each event type; easier to understand and debug subscription state transitions.

### 6.1 Subscription Management Modal Refactoring

**Problem**: `AccountSettingsModal.tsx`'s `ManageView` component (250 lines) mixed concerns: API call logic (`handleCancel` fetch), state management (3 local state vars for cancel flow), and UI rendering. Testing cancel flow required mocking the component; reusing cancel logic elsewhere required duplicating code.

**Solution**: Extracted cancel flow into `useCancelSubscription` hook (`src/hooks/useCancelSubscription.ts`):
- Hook owns: `cancelling`, `confirmCancel`, `justCancelled` state + `handleCancel` async function + cancel toast notifications.
- Component calls hook and derives `isCancelled` (computed value covering both "already cancelled on load" and "just cancelled now").
- Hook can be reused in future cancel-related UIs (e.g., bulk user management).
- **Benefit**: Clear separation of concerns; cancel flow is now independently testable and reusable.

### 6.2 Label System Overhaul (Dynamic Capabilities)
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

### 6.3 Complexity Reduction
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

**MapViewport.tsx** (Major architectural split)
- **Delegation Refactor**: Split the ~1,200 line monolith into modular sub-components and hooks.
- Extracted `useMapSync()` hook — contains the core imperative sync engine and export bridge.
- Extracted `RouteLayerGroup`, `BoundaryLayerGroup`, and `CalloutMarker` as dedicated functional components.
- Extracted `mapUtils.ts` — contains `resolveClickTarget` and `applyPickResult` for picking logic clarity.

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

### 6.4 Code Duplication Elimination & Utility Extraction

**Problem**: Five instances of significant code duplication were identified across the codebase:
1. **Search Field Logic**: `SearchField.tsx` and `RoutePlanner.tsx`'s `InspectorSearchField` duplicated ~80% of Mapbox SearchBox session management, proximity bias, and suggestion handling.
2. **Animation Phase Computation**: Both `useCalloutAnimationState.ts` and `renderCallout.ts` duplicated the `enterEnd`/`exitStart` phase and progress calculation logic.
3. **Hex Color Conversion**: Identical `withAlpha()` / `hexWithAlpha()` functions existed in `CalloutCard.tsx` and `renderCallout.ts`.
4. **Interface Name Collision**: Two unrelated interfaces both named `CalloutAnimationState` (UI state in hook vs. canvas render state in service) created confusion despite different semantics.
5. **Dual State Synchronization**: `ExportModal.tsx` maintained both a local React state and a store state for `isExporting`, requiring manual synchronization in 5+ places.

**Solution**: Systematic extraction of shared logic into reusable abstractions:

**New Files:**
- **`src/hooks/useLocationSearch.ts`** — Extracted hook managing Mapbox SearchBox session, proximity bias, suggestion fetching, and coordinate parsing.
  - Owned state: `query`, `suggestions`, `isOpen`, `loading`
  - Owned functions: `performSearch()`, `handleSelect()`, `handleClose()`, `clear()`
  - Option: `parseCoordinates` enables direct lat/lng input (used by RoutePlanner)
  - Both `SearchField` and `InspectorSearchField` now call this hook; each retains its own UI (Popover vs. Card)

- **`src/engine/calloutAnimation.ts`** — Extracted `computeCalloutPhase()` utility for phase and progress calculation.
  - Returns: `{ phase: 'enter' | 'visible' | 'exit', progress: number } | null`
  - Used by both `useCalloutAnimationState.ts` (for UI animation) and `renderCallout.ts` (for canvas opacity)
  - Eliminates duplicate `enterEnd`/`exitStart` calculation logic

- **`src/utils/colors.ts`** — Extracted `hexToRgba()` color utility.
  - Converts hex strings (e.g., `#FF0000`) to rgba with alpha (e.g., `rgba(255, 0, 0, 0.87)`)
  - Used by `CalloutCard.tsx` (DOM rendering) and `renderCallout.ts` (canvas rendering)

**Modified Files:**
- **`src/components/Search/SearchField.tsx`** — Now uses `useLocationSearch` hook; removed 70 lines of session/search logic. Retains Popover UI and `name` prop sync.
- **`src/components/Inspector/RoutePlanner.tsx`** — `InspectorSearchField` now uses `useLocationSearch` with `parseCoordinates: true`. Removed 70 lines of search logic; retains Card UI and coordinate sync.
- **`src/components/MapViewport/hooks/useCalloutAnimationState.ts`** — Uses `computeCalloutPhase()` utility; reduced phase/progress computation from 20 lines to 3 lines.
- **`src/services/renderCallout.ts`** — Uses `computeCalloutPhase()` and `hexToRgba()`; reduced duplication footprint.
- **`src/components/MapViewport/CalloutCard.tsx`** — Imports `hexToRgba()` from utils; removed inline `withAlpha()` function.
- **`src/components/ExportModal/ExportModal.tsx`** — Removed local `isExporting` state; now reads from store via selector. Kept only store `setIsExporting()` calls as single update path.

**Interface Renames** (for clarity):
- `src/components/MapViewport/hooks/useCalloutAnimationState.ts`: Local `CalloutAnimationState` → `CalloutUIAnimationState`
- `src/services/renderCallout.ts`: Exported `CalloutAnimationState` → `CalloutRenderState`
- No external import changes needed (types inferred by consumers)

**Benefits:**
- **Reduced Maintenance Burden**: Future changes to search logic, animation, or color handling require only one edit.
- **Type Safety**: No more interface name collisions.
- **Single State Source**: `ExportModal` now reads `isExporting` from store, eliminating sync errors.
- **Reusability**: `useLocationSearch` and `computeCalloutPhase()` can be used in future features without code duplication.
- **Testability**: Extracted utilities are independently testable in isolation.
- Export: `Video` → `Clapperboard` (more distinct for cinematic final output)

### 6.4 Responsive Layout Logic (`src/hooks/useResponsive.ts`)
Detects **Mobile (< 706px)**, **Tablet (707px - 1024px)**, and **Desktop (> 1025px)**. Allows components to switch layouts or "modes" dynamically. Note: The mobile breakpoint was recently moved to 706px to better accommodate larger modern phone displays.

### 6.5 High-Performance Imperative Sync (Guarded Zero-Re-render Architecture)
**Goal**: Achieve fluid 60fps animations for map layers and UI elements by bypassing React's reconciler during playback and scrubbing, while maintaining a near-zero resource footprint when idle.

**Core Implementation:**
1. **Imperative Playhead (`TimelinePanel.tsx`)**: The timeline ruler diamond, track line, and time display are updated via DOM refs inside a store subscription. React is only used for the initial Layout and item CRUD.
2. **Guarded Imperative Layers (`MapViewport.tsx`, `RouteLayerGroup.tsx`, `BoundaryLayerGroup.tsx`)**: 
   - `RouteLayerGroup` and `BoundaryLayerGroup` use `map.addSource()` and `map.addLayer()` directly. They subscribe to the store with **`useRef` time-guards** that prevent redundant `setData()` calls when `playheadTime` hasn't changed.
   - **Paint property guards**: `setPaintProperty` is only called when a property value actually changes (via `lastPaintRef` cache). During playback at 60fps, static style properties like `line-color` and `line-width` are no longer re-applied every frame — only when the user changes them in the Inspector.
   - **Geometry caching**: For static geometry (e.g., fade-style boundaries where only opacity animates), `setData()` is skipped unless the underlying GeoJSON reference changes, eliminating redundant GPU uploads.
   - **Vehicle animation**: Vehicle position (dot/car/plane) is now updated imperatively inside `RouteLayerGroup`'s subscription loop instead of triggering React re-renders via `VehicleAnimatedLayer`. Zero per-frame React reconciliation.
   - **Glow layer lifecycle**: Glow layer is added once on mount with `visibility: 'none'`, then toggled via `setLayoutProperty('visibility')` per-frame. This eliminates the expensive `addLayer`/`removeLayer` churn that occurred inside animation callbacks.
3. **Idempotent Sync Engine**: Atmospheric settings (Fog, Star Intensity, Terrain) and 3D config properties are synchronized via an `idle` event loop. All `setConfigProperty`/`setTerrain`/`setFog` calls are guarded by change checks to prevent redundant Mapbox operations during continuous tile loading and camera movement.
4. **Selector-Isolated Viewport**: `MapViewport` uses only low-frequency selectors (`mapStyle`, `items`, `itemOrder`, `selectedItemId`, etc.) and **never subscribes to `playheadTime` or `isMoveModeActive`**. These high-frequency subscriptions are isolated in the `CalloutMarkerList` child component, which owns callout animation state computation. This ensures the parent map shell **never re-renders** during playback, even though `CalloutMarkerList` is animating imperatively.
5. **Fast Keyboard Stepping**: Keyboard shortcuts read state imperatively via `useProjectStore.getState()` to avoid dependency-array re-render cascades.

### 6.6 Account UX & Payment Tier Restructuring
**Problem**: The original auth and payment system had gatekeeping issues (free tier blocking credit purchases, no subscription management UI), limited auth options, and a weak tier structure. New design opens payments to all users and adds granular account controls.

**Tier Restructuring:**
- **Wanderer** ($10/mo): New **paid entry tier**. 100 credits/mo, 1 cloud render at a time, unlimited cloud saves.
- **Cartographer** ($15/mo): 500 credits/mo, 2 parallel renders, unlimited cloud saves.
- **Pioneer** ($35/mo): 2,000 credits/mo, 5 parallel renders, unlimited cloud saves.
- **Nomad** (credit-pack only): New **automatic tier** granted when users buy credit packs. 0 monthly credits, 1 parallel render, cloud saves while balance > 0. Credits purchased this way never expire.

No free tier exists. Account creation is now tied to payment flow — unauthenticated users can see the credits modal, buy a pack, and sign up during checkout. Abandoned accounts (created but never paid) are cleaned up via daily Vercel cron after 24h.

**Auth Modal Redesign (`AuthModal.tsx`)**:
- **Sign-in mode**: Email + password. Google & Apple OAuth buttons disabled (greyed out for future support).
- **Sign-up mode**: Same form, opened during checkout. Shows "Create Account & Subscribe" CTA and "Already have an account?" link for existing users.
- Password is stored via Supabase Auth.

**Unauthenticated Checkout Flow**:
1. User opens Credits modal → clicks "Top Up Credits" or clicks "Subscribe" on a plan card.
2. `startCheckout()` stores intent in localStorage (`storePendingPlan()` or `storePendingTopup()`).
3. Opens signup modal (not sign-in modal).
4. After account creation, `SIGNED_IN` event fires → `initAuth()` checks localStorage → resumes `initiateDodoCheckout()`.
5. User redirected to Dodo hosted checkout.

**Subscription Management (`AccountSettingsModal.tsx`)**:
- New **Manage sub-view** with:
  - Current tier + active/cancelled status.
  - Renewal or access-until date.
  - Credit balance breakdown (monthly + purchased).
  - **For recurring subs**: Two-step cancel button with warning ("You'll lose cloud save access on [date]. Existing saves remain.")
  - Cancel-at-period-end via Dodo API; user retains access until renewal_date.
  - Upgrade path to higher tier.

**Credits Modal for Everyone**:
- Top Up tab now shows the slider to **all users** (removed the gate).
- Benefit callout explains: "30s timeline unlock, cloud saves while balance > 0, credits never expire."
- Unauthenticated users clicking Checkout triggers the signup flow.

**Webhook Safeguards (`api/dodo-webhook.ts`)**:
- Product IDs and environment mode read from env vars (support test_mode and live_mode without code changes).
- Error checking on all credit balance writes and subscription upserts — failures return 500 so Dodo retries.
- Nomad upsert only happens if user has no active subscription (preserves higher tiers).

**Daily Account Cleanup (`api/cleanup-free-accounts.ts`)**:
- Vercel cron job runs daily at midnight UTC.
- Deletes `auth.users` with no subscription row and `created_at > 24h ago`.
- Grace period is configurable (single const at top of file).

### 6.7 Cloud Saves & Bi-Directional Sync

**Problem**: Users want cloud backup of projects across devices, but only paid subscribers should access this feature. Ex-subscribers (whose paid plan expires) should retain limited cloud access as a grace mechanic.

**Solution**: A Supabase-backed cloud library with tier-based access control and offline-tolerant sync.

**Architecture**:

1. **Supabase Table** (`cloud_projects`):
   - `id` (TEXT, nanoid-generated, same as local `project.id`)
   - `user_id` (UUID, required), `name`, `data` (JSONB project), `updated_at`, `created_at`
   - RLS: users can only CRUD their own rows

2. **Access Rules** (`src/lib/cloudAccess.ts`):
   - Wanderer / Cartographer / Pioneer (active subscription): unlimited cloud saves
   - Nomad (credit-pack buyers AND ex-subscribers with grace credits): cloud saves while `purchased_credits > 0`
   - Credits are a gate only — saving does NOT deduct credits (renders do)
   - Expired/cancelled subscriptions: webhook downgrades tier to `nomad`, sets status to `active`, grants 10 non-expiring `purchased_credits`

3. **Local Library Extensions** (`src/services/projectLibrary.ts`):
   - Added `cloudSyncedAt` (Unix ms of last successful cloud push, or null if never synced)
   - Added `pendingSync` (true when local changes haven't been pushed)
   - New function `updateCloudSyncMeta()` for patching sync fields only

4. **Sync Engine** (`src/services/cloudSync.ts`):
   - **Download**: Cloud → Local when cloud's `updated_at > local.cloudSyncedAt` (or cloud-only projects)
   - **Upload**: Local → Cloud when `pendingSync === true` or `updatedAt > cloudSyncedAt` (only if `canCloudSave()`)
   - **Conflict**: Newer timestamp always wins
   - **Network errors**: Returns `offline: true` — caller shows toast and leaves pending flags

5. **Save Flow** (`src/components/Toolbar/useToolbarActions.ts`):
   - Always save locally first (preserving existing `cloudSyncedAt`)
   - If `canCloudSave()`:
     - Try cloud push
     - On success: update `cloudSyncedAt = now`, clear `pendingSync`
     - On fail (any error): toast "Saved locally — you're offline", leave `pendingSync = true`
   - If not `canCloudSave()`: save locally only, no cloud intent

6. **Sync Triggers**:
   - On app open (once per user session, via `MapStudioEditor.tsx`)
   - On save button click
   - On refresh button in "My Projects" modal (`ProjectLibraryModal.tsx`)

7. **Modal UI** (`src/components/ProjectLibrary/ProjectLibraryModal.tsx`):
   - Merged list: local projects + cloud-only projects (never synced locally)
   - Cloud icon ☁️: project has ever been synced
   - CloudUpload icon ⬆️: pending-sync (amber)
   - Refresh button: syncs cloud + local, downloads new cloud projects
   - **Loading cloud-only with NO cloud access**: fork with new UUID (prevents mutating a read-only cloud copy)
   - Delete: removes from both local + cloud (if cloud-backed and access available)

8. **Webhook Behavior** (`api/dodo-webhook.ts`, `subscription.expired` case):
   - For expired wanderer/cartographer/pioneer: downgrade to nomad, add 10 purchased_credits
   - Nomad-only users not touched (they have no `dodo_subscription_id`)

**Key Design Decisions**:
- CloudSyncedAt tracks "last successful push" (not cloud's actual timestamp) to detect local changes
- Nomad grace credits (10, non-expiring) create a soft landing for expired users
- Conflict resolution favors newer timestamp (simple, predictable, no data loss)
- Offline errors are non-fatal (sync retried on next open/save/refresh)

**Recent Bug Fix**: The `cloud_projects.id` column was originally UUID-typed, but the app generates nanoid-style IDs. Migration `004_cloud_projects_text_id.sql` changed the column to TEXT. Additionally, `saveProjectToCloud()` was missing the `user_id` field in the upsert payload, violating the RLS policy — now includes it via `useAuthStore.getState().user?.id`.

---

### 6.8 UI & Design Refinements

**Enter-to-Search (Stability)**
- **Problem**: Automatic debounced search on every keystroke was causing "input stutter" and visual flickering in the dropdown when users typed quickly.
- **Solution**: Shifted to a manual search model. The `SearchField` and `InspectorSearchField` (used for routes, callouts, and boundaries) now only hit the geocoding APIs when the user presses **Enter**. Typing immediately clears stale suggestions to keep the interface clean.
- **Result**: Zero typing lag and more predictable search results.

**Sharp-Cornered Callouts (Aesthetics)**
- **Problem**: The "Standard Box" callout style used variable rounding that sometimes felt inconsistent with the "News" and "Topo" variants.
- **Solution**: Standardized the 'default' variant to use **sharp corners (0px radius)**.
- **Complexity Reduction**: Removed the `borderRadius` control from the Callout Inspector for the default variant, simplifying the property shelf.

---

## 7. Critical Implementation Details

### 7.1 Animation & Routing Logic
- **Search Box API Integration**: The app uses `@mapbox/search-js-core` (SearchBoxCore + SearchSession) for geocoding instead of the legacy Geocoding v5 API. Each search component maintains its own `SearchSession` instance for proper session scoping. To ensure stability and prevent race conditions during rapid typing, searches are **triggered only when the user presses Enter**. The SDK handles session token lifecycle internally. Results include improved POI coverage with `place_formatted` secondary text.
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
- **default**: Sharp-cornered rectangle + text. (Radius control removed for professional clarity).
- **modern**: Pill shape + accent glow dot + 87% opacity background
- **news**: Rectangle + 5px left accent bar + uppercase bold text
- **topo**: Left border + metadata (coordinates/elevation) + accent square dot

### 7.5 High-Resolution Snapshot Service (`src/services/snapshot.ts`)
A dedicated service for capturing 60fps-quality stills without the overhead of video encoding. It shares the `renderCallout.ts` logic with the video export engine but focuses on a single-frame capture of the **manual manual camera state**. It handles the complex lifecycle of enabling `preserveDrawingBuffer`, resizing the map to target resolution, waiting for tile resolution, compositing callouts, and cleaning up — all while keeping the user informed via Sonner toasts.

### 7.4 Security Fixes & Vulnerability Mitigation

**Issue 1: RLS Policy Loophole (Critical)**

The initial schema used `FOR ALL` policies on `subscriptions`, `credit_balance`, and `render_jobs` with only a `USING` clause. In Postgres, this allows authenticated users to UPDATE their own rows directly from the browser — e.g., setting `purchased_credits = 999999` or upgrading their own `tier`.

**Fix** (Migration 005):
- Dropped over-permissive `FOR ALL` policies.
- Replaced with `FOR SELECT` policies only — clients can read their own data but cannot write.
- Service role key (used by webhook handlers) bypasses RLS entirely, so writes via `api/dodo-webhook.ts` are unaffected.
- This closes the attack surface since the frontend never INSERTs/UPDATEs these tables — all provisioning is server-side.

**Issue 2: Payment Replay Attack (Medium)**

The webhook's `payment.succeeded` (topup) handler used a read-modify-write pattern without deduplication: `update({ purchased_credits: existing + credits })`. If Dodo retried a webhook (e.g., due to temporary network timeout), the user would receive double or triple credits.

**Fix** (Migration 006 + webhook change):
- Added `processed_payments` table (payment_id TEXT PRIMARY KEY) to track payments that have been processed.
- Before crediting a topup, the webhook attempts to INSERT the payment's `payment_id` into this table.
- A unique-constraint violation (code 23505) means the event is a duplicate — the handler returns 200 without crediting.
- Any other DB error returns 500 so Dodo retries (correct behavior for infrastructure failures).
- Other webhook events (`subscription.active`, `subscription.renewed`, `subscription.expired`) were already idempotent by design (upsert with fixed values, or keyed on `dodo_subscription_id`).

**Webhook References**:
- `subscription.active` case (lines 96–185): Upsert on `user_id` — idempotent. Now also recognizes `"cancelling"` status to avoid premature downgrade when user buys credits during cancellation period.
- `payment.succeeded` case (lines 191–285): Idempotency-guarded via `processed_payments` table. Uses atomic `increment_purchased_credits()` RPC to avoid race with concurrent topups.
- `subscription.renewed` case (lines 288–311): Sets fixed monthly_credits value — idempotent.
- `subscription.expired` case (lines 335–413): Idempotency-guarded via `processed_webhook_events` table (new in Migration 008). Grace credits granted via atomic `increment_purchased_credits()` RPC (fixes issue 9). Recognizes `"cancelling"` status to preserve tier during subscription winding-down period.

**Issue 3: Render Job Tampering (Low-Medium)**

Same `FOR ALL` policy allowed users to UPDATE their own `render_jobs` rows, potentially changing `status` or `credits_cost`. Frontend never exercises this (only SELECTs), but the DB-level vulnerability exists.

**Fix**: Covered by Migration 005 (changed to `FOR SELECT` only).

**Issue 4: Open Redirect + Token Leakage via Unvalidated Checkout URLs (High)**

The `api/dodo-create-session.ts` endpoint accepted `returnUrl` and `cancelUrl` directly from the client request body and forwarded them to Dodo's payment processor without validation. An authenticated attacker could craft a checkout with a malicious redirect URL (e.g., `https://attacker.com/?token=...`) to redirect users post-payment and potentially exfiltrate tokens in query parameters.

**Fix** (api/dodo-create-session.ts):
- Added hostname/origin validation using `new URL().hostname` parsing.
- Allows any subdomain of `APP_DOMAIN` (e.g., `lilmappo.tech`, `app.lilmappo.tech`, `preview-*.lilmappo.tech`) plus localhost for development.
- Set `APP_DOMAIN=lilmappo.tech` in `.env`; production must set this in Vercel env vars.
- Rejects URLs with invalid origins at the server before sending to Dodo.

**Issue 5: Race Condition on Concurrent Topup Credits (High)**

The `api/dodo-webhook.ts` handler for `payment.succeeded` (topup event) used read-modify-write without atomicity: `read purchased_credits → insert processed_payments → update purchased_credits = old + new`. While the `processed_payments` table guards against the *same* payment_id being processed twice, it does NOT protect against two *different* payment events for the same user arriving concurrently — both would read the old balance and one increment would be silently lost.

**Fix** (Migration 007 + webhook update):
- Created new Postgres function `increment_purchased_credits(p_user_id, p_amount)` that atomically increments the credit balance in a single UPDATE statement.
- Webhook now calls `supabase.rpc('increment_purchased_credits', { p_user_id: uid, p_amount: credits })` instead of the read-then-write pattern.
- The function handles the fallback case (row doesn't exist) via ON CONFLICT upsert.

**Issue 6: Hardcoded `test_mode` Environment in Cancel Endpoint (Medium)**

The `api/dodo-cancel-subscription.ts` hardcoded `environment: "test_mode"` while `dodo-create-session.ts` and `dodo-webhook.ts` correctly read from `process.env.DODO_ENVIRONMENT`. In production, subscription cancellations would be sent to the test environment and silently fail, leaving users' subscriptions active while they believed they'd cancelled.

**Fix** (api/dodo-cancel-subscription.ts:63):
- Changed hardcoded `"test_mode"` to `(process.env.DODO_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode"`.
- Now correctly reads the same environment variable as the other endpoints.

**Issue 7: Verbose Upstream Error Propagation to Client (Medium)**

Both `api/dodo-create-session.ts` and `api/dodo-cancel-subscription.ts` returned raw provider error messages to the client: e.g., `error: "Checkout session creation failed: Network timeout from provider"`. These internal error details can aid attackers in reconnaissance and social engineering.

**Fix**:
- Changed error responses to generic client-safe messages: `"Checkout unavailable. Please try again."` and `"Cancellation failed. Please try again."`.
- Full error messages remain in `console.error()` for server-side debugging.

**Issue 8: Immediate Access Revocation on Subscription Cancel (Critical Logic Error)**

When a user clicked "Cancel Subscription", the endpoint immediately set `status: "cancelled"` in the database. The subscription hook (`useSubscription.ts`) queries for `status === "active"`, and the cloud-save gate (`canCloudSave.ts`) checks the same condition. As a result, users lost access to cloud saves and parallel renders *instantly*, even though they had days or weeks remaining in their billing period — violating standard SaaS practice where paid access continues until period end.

**Fix** (Multiple files):
- Added new `"cancelling"` status to the subscription status union (`database.types.ts`).
- Changed `dodo-cancel-subscription.ts` to set `status: "cancelling"` instead of `"cancelled"`. This status persists until the webhook's `subscription.cancelled` event fires at period end.
- Updated `useSubscription.ts` to query for `.in("status", ["active", "cancelling"])` — both statuses are treated as "subscribed".
- Updated `canCloudSave()` to allow both `"active"` and `"cancelling"` status for cloud-save access.
- Updated UI (`AccountSettingsModal.tsx`) to:
  - Show "Cancelling" badge (instead of just "Cancelled") for the in-between state.
  - Display "Cancels on [date]" for subscriptions scheduled to cancel (helpful context for users).
  - Show "Access until [date]" for subscriptions already cancelled (past state).
- The existing webhook handlers complete the lifecycle: `subscription.cancelled` event (at period end) sets status to `"cancelled"` (briefly), then `subscription.expired` downgrades the user to the nomad tier with grace credits.

**Webhook Behavior Unchanged**:
- `subscription.cancelled` → transitions from `"cancelling"` to `"cancelled"` (as intended).
- `subscription.expired` → downgrades paid tiers to nomad + grace credits (unchanged).

**Issue 9: Grace Credits Race Condition in `subscription.expired` Handler (High)**

When a paid-tier subscription expired, the handler read the user's `purchased_credits` balance, added 10 grace credits, and wrote it back: `update({ purchased_credits: existing + 10 })`. If a concurrent topup webhook arrived between the read and write, the topup increment would be overwritten and lost — the same race condition that issue 5 fixed for topups.

**Fix** (Migration 007 + webhook update):
- The existing `increment_purchased_credits()` RPC (created for issue 5) is now also used by the `subscription.expired` handler.
- Call: `supabase.rpc('increment_purchased_credits', { p_user_id: expiringSub.user_id, p_amount: 10 })`.
- The RPC atomically increments in a single UPDATE, eliminating the race window.

**Issue 10: `subscription.expired` Event Replay Vulnerability (Medium)**

The `subscription.expired` webhook event handler had no idempotency guard. Unlike the `payment.succeeded` topup handler (guarded by `processed_payments` table) and `subscription.cancelled`/`subscription.renewed` handlers (naturally idempotent by upsert pattern), the expired handler had a side-effect (granting 10 grace credits) that was not replay-safe. If Dodo retried the webhook, the user would receive another 10 credits.

**Fix** (Migration 008 + webhook update):
- Created new `processed_webhook_events` table (event_key TEXT PRIMARY KEY) to track mutating webhook events.
- Before downgrading to nomad and granting grace credits, the handler inserts `subscription.expired:{dodo_subscription_id}` into the table.
- A unique-constraint violation (code 23505) indicates a duplicate event — the handler returns 200 without re-processing.
- Any other DB error returns 500 so Dodo retries (correct behavior for infrastructure failures).

**Issue 11: Premature Tier Downgrade on Topup Purchase During Cancellation Period (Medium)**

The topup handler checked for an "active" subscription before deciding whether to grant Nomad tier. The logic did not recognize the `"cancelling"` status (a user who has requested cancellation but is still in their billing period with full access). A Cartographer subscriber in `"cancelling"` status who bought a credit pack would be immediately downgraded to Nomad tier, losing their 2 parallel render slots for the remainder of their subscription period.

**Fix** (api/dodo-webhook.ts, lines 252–254):
- Updated `hasActiveSub` check to include `"cancelling"` status: `existingSub.status === "active" || existingSub.status === "on_hold" || existingSub.status === "cancelling"`.
- A user in any "active-like" status now correctly preserves their tier when buying credits.

**Issue 12: Webhook Header Type Casting Vulnerability (Low)**

The signature verification code cast `req.headers` to `Record<string, string>`: `{ headers: req.headers as Record<string, string> }`. However, Node.js delivers header values as `string | string[] | undefined`. This TypeScript-only cast did not affect runtime behavior, but if the Dodo SDK internally encountered a multi-valued header (e.g., a duplicate signature header injected by a proxy or attacker), the SDK's behavior would be undefined — potentially treating the array as a string (`"value1,value2"`) or using only the first element.

**Fix** (api/dodo-webhook.ts, lines 74–82):
- Added explicit normalization before passing to `dodo.webhooks.unwrap()`:
  ```typescript
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      normalizedHeaders[key] = Array.isArray(value) ? value[0] : value;
    }
  }
  ```
- Coerces all multi-valued headers to their first element (standard HTTP semantics for signature verification).
- Ensures the Dodo SDK receives the correct type, eliminating runtime ambiguity.

**Issue 13: Unvalidated Redirect URLs in Test Environments (Low-Medium)**

The `dodo-create-session.ts` endpoint validated redirect URLs but had a fallback that allowed misconfigured environments to proceed without validation. Specifically, if `APP_DOMAIN` was unset and `DODO_ENVIRONMENT !== "live_mode"`, the validation would only log a warning and allow any redirect URL to pass through. An attacker with a valid Supabase JWT in such an environment could craft a phishing redirect (e.g., `https://attacker.com/?token=...`) to steal user tokens post-payment.

**Fix** (api/dodo-create-session.ts, lines 76–81):
- Changed validation to unconditionally reject invalid redirect URLs regardless of environment or `APP_DOMAIN` setting.
- Separated the misconfiguration warning: if `DODO_ENVIRONMENT === "live_mode"` without `APP_DOMAIN`, log a warning (only localhost redirects are allowed by default).
- Local development remains unaffected — `isAllowedHost()` already allows localhost and any domain matching `APP_DOMAIN` if set.

**Issue 14: Unlimited Credits via Public RPC (Critical)**

The `increment_purchased_credits()` function (Migration 007) was created with `SECURITY DEFINER` but never revoked the default `PUBLIC` execute grant. In PostgreSQL, functions in the public schema are executable by `PUBLIC` (all users, including `anon` and `authenticated` roles) by default. This meant any browser client could call `supabase.rpc('increment_purchased_credits', { p_user_id: 'xxx', p_amount: 999999 })` to arbitrarily inflate any user's credit balance.

While Migration 005 made `credit_balance` read-only for direct table access, the RPC bypasses RLS entirely (functions with `SECURITY DEFINER` run as the owner, not the caller).

**Fix** (Migration 009):
- Added `REVOKE EXECUTE` statements for `PUBLIC`, `anon`, and `authenticated` roles.
- Only `service_role` (and postgres) can now execute the function. Server-side webhook handlers use the service_role key and are unaffected.

**Issue 15: Catastrophic Data Loss in Cleanup Script (High)**

The daily account cleanup cron job (`api/cleanup-free-accounts.ts`) properly paginates the `auth.users` fetch but made a **single unpaginated query** to `subscriptions.select("user_id")`. PostgREST defaults to a 1000-row maximum. If the app has more than 1000 subscribers:
- The `subscribedIds` set is incomplete.
- Any subscriber not returned in the first 1000 rows is falsely identified as a "free user".
- Their account is **permanently deleted** if created >24 hours ago.

This is a latent bug: currently harmless for a new app, but catastrophic once subscriber count exceeds 1000.

**Fix** (api/cleanup-free-accounts.ts, lines 61–82):
- Converted the subscriptions fetch to a paginated loop using `.range()` and `subsFrom`/`subsPageSize`.
- Accumulates all subscriber IDs before filtering.
- Mirrors the existing users pagination pattern for consistency.

**Issue 16: Cloud Save Gate Bypass (High)**

The RLS policy `own_cloud_projects` (Migration 003) only checked `auth.uid() = user_id` for all operations. No subscription or credit-balance validation. The `canCloudSave()` frontend gate checks subscription status and nomad-tier credits, but the **backend enforces nothing**.

Result: Any authenticated user could call `supabase.from('cloud_projects').upsert(...)` from the browser console to bypass the subscription requirement entirely.

**Fix** (Migration 010):
- Split the `own_cloud_projects` `FOR ALL` policy into four targeted policies:
  - **SELECT** and **DELETE**: Ownership only (unchanged). Users must access their data even after subscription lapses.
  - **INSERT** and **UPDATE**: Ownership + subscription gate with a `WITH CHECK` subquery.
- The gating logic mirrors `canCloudSave()` exactly:
  - User must have a row in `subscriptions` with `status IN ('active', 'cancelling')`.
  - If `tier = 'nomad'`, also requires `credit_balance.purchased_credits > 0`.
  - All other combinations (no subscription, expired/cancelled, nomad with no credits) are denied.

**Issue 17: Credit Inflation via Webhook Replay (High)**

The `subscription.active` and `subscription.renewed` handlers in `api/dodo-webhook.ts` lacked idempotency guards on their credit balance updates. Specifically:

- `subscription.active`: If Dodo replayed the webhook (due to transient 500 error), the `credit_balance.monthly_credits` UPDATE would run again, resetting the user's balance to the plan max even if they had already spent some credits.
- `subscription.renewed`: No idempotency guard at all. A user could exhaust credits, trigger a server failure during renewal, and receive fresh credits on each Dodo retry, effectively infinite credit generation.

**Fix** (api/dodo-webhook.ts, lines 128–146, 327–344):
- Added idempotency guards using `processed_webhook_events` table (Migration 008).
- `subscription.active`: Key format `subscription.active:{subscription_id}` prevents duplicate activation processing.
- `subscription.renewed`: Key format `subscription.renewed:{subscription_id}:{renewalDate}` is critical — the billing-period suffix allows legitimate credit resets on the *next* cycle while blocking replays within the same period.
- Both handlers now DELETE the idempotency key on error before returning 500, allowing Dodo to retry cleanly.

**Issue 18: Credit Loss on Failed Transaction (High)**

The `payment.succeeded` (topup) and `subscription.expired` handlers inserted the idempotency key, then executed the side effect (RPC or UPDATE). If the side effect failed and returned 500:

1. Dodo retried the webhook.
2. Idempotency key INSERT failed with 23505 (unique constraint).
3. Handler detected 23505 and silently returned 200 without executing the side effect.
4. User never received credits despite payment being collected.

**Fix** (api/dodo-webhook.ts, lines 268–272, 351–355, 367–371):
- Added compensating `DELETE` statements on operation failure.
- If the RPC or UPDATE fails, the idempotency key is deleted before returning 500.
- On Dodo's retry, the key re-inserts cleanly and the side effect executes.
- This restores the invariant: "idempotency key exists iff the operation succeeded."

**Issue 19: False Positive — Nomad Access Breakage via Race Condition (NOT EXPLOITABLE)**

Earlier analysis suggested that `subscription.cancelled` arriving after `subscription.expired` could overwrite nomad status, causing users to lose cloud-save access. However, this scenario is not possible:

- The `subscription.expired` handler sets `dodo_subscription_id: null` (line 453).
- The `subscription.cancelled` handler does `.eq("dodo_subscription_id", sub.subscription_id)` to find the row.
- Concurrent or out-of-order execution both resolve correctly; no user data is lost.

**Issue 22: Mobile UI Overlap & Viewport Height (Resolved)**

The application previously used `h-screen` (100vh) for the root container, which in many mobile browsers includes the area hidden behind the dynamic address bar. This caused bottom-anchored UI (like the timeline) to be obscured when the address bar was visible.

**Fix** (MapStudioEditor.tsx, TimelinePanel.tsx):
- Replaced `h-screen` with **`h-dvh`** (Dynamic Viewport Height). The app now automatically resizes as the browser chrome collapses/expands.
- Added **`viewport-fit=cover`** to `index.html` to enable safe area support.
- Implemented **`env(safe-area-inset-bottom)`** and **`env(safe-area-inset-top)`** across the Toolbar, Timeline, and Toasts. This ensures the UI respects hardware notches and the iOS home indicator.

**Issue 23: Mobile/Tablet UI Efficiency (Overhauled)**

The mobile and tablet interfaces were previously too cramped or overly condensed, missing opportunities for better spatial utilization.

**Fix** (Toolbar.tsx, TimelinePanel.tsx):
- **Mobile Timeline**: Removed redundant "Timeline" text and left-anchored transport controls. The time readout was moved to the previously empty sticky column to the left of the ruler, saving vertical space.
- **Hybrid Tablet Toolbar**: Tablet now uses the **Desktop Toolbar** as its base but with a **Condensed Layers Dropdown**. This keeps the "Add" tools expanded for high productivity while grouping map environment settings into a single layers button.
- **Zen Mode Controls**: Repositioned to the **Top-Right** corner for all devices and reordered to prioritize the Play/Pause button.

**Issue 24: High-Resolution Map Snapshots (New Service)**

Users needed a way to capture high-quality stills of their maps without starting a full video export, specifically at the target product resolution rather than just a screenshot of their window.

**Fix** (src/services/snapshot.ts):
- Created a dedicated **Snapshot Service** that handles off-screen map rendering.
- **Resolution Independence**: Temporarily resizes an off-screen map container to the project's target resolution (e.g., 1080p/4K) to ensure crisp captures.
- **Manual Camera Mode**: Specifically ignores playhead-interpolated camera keyframes, capturing exactly what the user is currently looking at manually in the viewport.
- **Automatic Sync**: Flips `preserveDrawingBuffer` on/off automatically, triggering the necessary Mapbox re-initialization passes only when needed.
- Integrated into **Zen Mode** with a new Camera button in the top-right controls.

---

**Issue 20: Decoupled Vehicle Visibility & Animation (High)**

The vehicle system (dots and 3D models) in `RouteLayerGroup.tsx` was previously decoupled from the route's active time window. Vehicles remained visible at the start or end of a path even when the route line itself was hidden (before `startTime` or after `endTime`). They also failed to respect "fade" exit animations, remaining fully opaque while the route line disappeared.

**Fix** (RouteLayerGroup.tsx):
- Implemented a **Visibility Guard** inside the imperative `updateRoute` loop.
- The vehicle's `visibility` layout property is now toggled correctly based on `playheadTime`, `startTime`, `endTime`, and the exit animation phase.
- Added **Opacity Synchronization**: Vehicles now fade out during `fade` exit animations by updating `circle-opacity` (dots) or `model-opacity` (3D models).
- **Eraser Exit Animation**: Redefined the `reverse` exit animation for both routes and boundaries. Instead of retracting lines from the tip, they now function as forward "erasers" that remove geometry from the starting point toward the completion point over 0.5s.
- Added **Comet Mode Guard**: Vehicles are explicitly hidden at `progress = 0` in comet mode to prevent them from "ghosting" at the start point before the trail appears.
- **Optimization**: All vehicle `setData` coordinates and transformation logic are now skipped when the vehicle is hidden, reducing per-frame CPU and GPU overhead.

**Issue 21: Broken Dash Pattern Synchronization (Resolved)**

The "Dash Pattern" dropdown in the Route Inspector was previously not functional. While users could select styles (Solid, Dashed, Dotted), the map engine in `RouteLayerGroup.tsx` was not applying the `line-dasharray` property to the Mapbox layers.

**Fix** (RouteLayerGroup.tsx):
- Integrated `line-dasharray` into the imperative synchronization loop for draw and navigation modes.
- Added **Glow Parity**: The glow layer now automatically inherits the dash pattern, ensuring that "glow" fragments remain perfectly aligned with the dashed/dotted segments of the main line.
- Implemented an **Equality Guard** in the paint cache to skip redundant Mapbox updates when the dash pattern hasn't changed.

---

## 8. Common Gotchas
- **Sync Engine Exposure**: The Mapbox Sync Engine is exposed on the map instance as `_syncRef` to allow the Export Engine to force-synchronize styles during frame capture.
- **Move Mode Persistence**: During "Pick on Map" or "Move Mode", input fields pulse and display "Click on map..." while disabling standard text input.
- **Scrollbar Aesthetics**: System-native scrollbars are hidden in search suggestions and routing menus via CSS (`scrollbar-width: none`) to maintain a clean aesthetic.
- **Search Box API Session Pricing**: The Search Box API uses session-based pricing. Search result suggestions don't include coordinates, so animated preview dots on the map are not feasible. Users interact with suggestions directly in the dropdown.

---

*This guide is maintained for AI agents and human developers alike. If you change a core architectural pattern, please update this file.*
