# LLM-START-HERE.md — Developer & AI Guide to li'l Mappo

Welcome to **li'l Mappo**, a cinematic map animation and export tool. This document provides a high-level technical map of the codebase, its architecture, and the mental model required to work with it effectively.

## 1. Project Identity & Purpose

**li'l Mappo** (`http://mappo.lazycatto.tech/`) is a browser-based "motion graphics" tool specifically for maps. Users can:
- **Import & Plan Routes**: Auto-generate car, walking, or 3D flight paths using Mapbox Directions and Great Circle math.
- **Interactive Callouts & Boundaries**: Search-based placement workflow with "Pick on Map" and unified drafting tools.
- **Choreograph**: Camera movements via keyframe-based timeline.
- **Annotate**: 3D callout cards with multiple style variants (default, modern, news, topo).
- **Save & Export**: Local IndexedDB library, cloud sync via Supabase, MP4 video export.
- **User Accounts**: Supabase Auth with credits, render job history, subscription tiers.

**UI Design**: Premium "floating island" aesthetic with responsive mobile/tablet/desktop modes. Tools are **mutually exclusive and non-modal** — opening one closes others, and they stay open during map interaction.

---

## 2. Tech Stack

- **Framework**: React 18+ (Vite) + Zustand (state management)
- **Maps**: Mapbox GL JS v3 via `react-map-gl/mapbox`
- **Persistence**: IndexedDB (local projects) + Supabase PostgreSQL (user data)
- **Auth**: Supabase Auth (email, Google OAuth, GitHub OAuth)
- **Data Fetching**: React Query v5
- **Video Export**: `mp4-muxer` + WebCodecs API + pure Canvas 2D (no DOM parsing)
- **Geospatial**: Turf.js libraries (`@turf/along`, `@turf/great-circle`, etc.)
- **Search**: `@mapbox/search-js-core` (SearchBox API with session-based pricing)
- **Payments**: Dodo Payments (hosted checkout, webhooks for provisioning)
- **UI Components**: Tier 1 (primitives) + Tier 2 (composites) built on shadcn/ui v0.9+

---

## 3. Core Architecture

The application is built around a **state-driven animation engine**.

### 3.1 The Brain: `src/store/useProjectStore.ts`

Everything lives in a single Zustand store. The `Project` type contains **only essential animation data**. Transient UI state lives alongside but is never persisted.

**Persisted (Project)**:
- `items`, `itemOrder`: Timeline elements (Routes, Boundaries, Callouts, Camera).
- `duration`, `fps`, `resolution`: Export settings.
- `projection`, `lightPreset`, `starIntensity`, `fogColor`, `terrainExaggeration`: Environment.
- `mapCenter`: For search proximity bias.

**Transient (UI State — NOT persisted)**:
- `mapStyle`, `labelVisibility`, `playheadTime`, `isInspectorOpen`, `timelineHeight`, selection state, drafting state (search results, preview geometries).

**Key Practice**: Use `useShallow` selectors to prevent unnecessary re-renders during playback:
```ts
const { fieldA, fieldB } = useProjectStore(
  useShallow(s => ({ fieldA: s.fieldA, fieldB: s.fieldB }))
);
```

This is applied to high-frequency components like `InspectorPanel` and `Toolbar` to avoid 60fps thrashing.

### 3.1b Authentication & User Data: `src/store/useAuthStore.ts`

Manages user auth state, modal visibility, and checkout flow. Integrates Supabase Auth + Dodo Payments webhooks.

**Auth State**: `user`, `session`, `isLoading`.

**Modal Flow**: 
- `showAuthModal` + `authModalMode` ('signin' | 'signup') for OAuth redirects.
- After signup, `pendingPlan` (stored in localStorage) survives redirects and auto-triggers checkout.

### 3.2 The Heart: `src/hooks/usePlayback.ts`

Drives the 60fps animation loop. Updates `playheadTime` and synchronizes all cameras/routes/callouts to the current frame.

### 3.3 The Body: `src/components/MapViewport/`

Manages the Mapbox instance. Hosts:
- **RouteLayerGroup**: Imperative syncing of Mapbox layers (draw/nav lines, vehicles, dasharrays, opacity).
- **BoundaryLayerGroup**: Polygon rendering with animation phases (fade, reverse "eraser").
- **CalloutGroup**: Screen-space projection and Canvas 2D rendering.
- **CameraController**: Interpolates camera keyframes.

**Key Lesson**: Imperative Mapbox layer updates avoid React re-renders but require careful **null/undefined guards** and equality checks to prevent redundant paint calls.

### 3.4 The Inspector: `src/components/Inspector/`

Right-side panel for editing selected items. Uses local state for draft values (to avoid store thrashing on keystroke) and flushes to store on blur/Enter. Shares unified **Route Planning UI** between Toolbar (new items) and Inspector (existing items) to avoid duplication.

### 3.5 Label System (Dynamic Capabilities)

**Lesson Learned**: Hardcoded label toggles per style + incorrect Config API property names = broken UX.

**Solution**: 
- `detectRuntimeCapabilities()` scans the loaded style's actual label layers at runtime.
- **Standard style** uses verified Config API mappings (`'place'` → `'showPlaceLabels'`, etc.).
- Custom styles use layer pattern matching.
- `toggleFeature()` routes to Config API (Standard) or layer visibility (others) intelligently.
- UI renders dynamically based on detected capabilities.

**Key Design**: Label visibility is **transient** (never persisted) — resets on project load.

### 3.6 Canvas Callout Rendering

**Lesson Learned**: `html2canvas` DOM parsing = 100–300ms per frame overhead during export.

**Solution**: Pure Canvas 2D rendering in `src/services/renderCallout.ts`. Four style variants (default, modern, news, topo) dispatch to variant-specific renderers. Each frame, callouts are projected to screen space, animation state computed, and drawn directly. **<1ms per callout.**

This approach also eliminated the DOM re-creation penalty and enabled frame-perfect callout animations during export.

---

## 4. UI Layout & Design System

### 4.1 Centralized Layout Constants

`src/constants/layout.ts` defines:
- `PANEL_MARGIN` (16px): Gutter between panels and screen edge.
- `PANEL_GAP` (16px): Air-gap between adjacent panels.
- `RIGHT_RESERVED_DESKTOP` (352px): Width reserved when Inspector is open (used to center map UI).

### 4.2 Component Standardization

**Tier 1 (Primitives)**: `IconButton`, `SegmentedControl`, `Field`, etc. in `src/components/ui/`.
**Tier 2 (Composites)**: `PanelHeader`, `ToolbarDropdownPanel`, etc. that combine Tier 1 primitives.

All use shared CSS `glass` effect + `shadow-2xl` for depth and polished hover states.

### 4.3 Toast Positioning

`useSonnerPosition` dynamically calculates toast position based on `isMobile`, `isInspectorOpen`, and `timelineHeight`. Toasts are **not corner-tethered** — they always appear in the active map area without overlapping UI.

---

## 5. Toolbar & Layout Architecture

### 5.1 Mobile & Tablet (`src/components/Toolbar/MobileToolbarLayout.tsx`)

**Mode-Switching** (slide animations, not dropdowns):
- **Default**: Logo, Project menu, Add (+), Layers, Play, Export, Hide UI.
- **Add Mode**: Route, Boundary, Callout + Camera KF + close.
- **Layers Mode**: Map style, Terrain, Buildings toggles + close.

**Lesson Learned**: Dropdowns on mobile waste vertical space; mode-switching creates a focused, immersive experience.

### 5.2 Desktop (`src/components/Toolbar/DesktopToolbarLayout.tsx`)

Inline controls + dropdowns; all controls visible at once.

### 5.3 Tablet Optimization

Tablet now uses **Desktop Toolbar as base** but with a **Condensed Layers Dropdown**. Keeps "Add" tools expanded for high productivity while grouping map settings into one button.

---

## 6. Architectural Refactoring & Lessons Learned

### 6.0 User Accounts & Supabase Integration

**Problem**: li'l Mappo needed auth, cloud persistence, and monetization.

**Solution**: Four-phase rollout (auth modals → Supabase wiring → real data → Dodo Payments checkout).

**Key Milestones**:
- **Phase 1**: Avatar Menu + Auth/Account/Credits/Renders modals + `useAuthStore`.
- **Phase 2**: Real Supabase Auth endpoints (email + OAuth) + RLS policies + database schema (credit_balance, subscriptions, render_jobs).
- **Phase 3**: Live data wiring + React Query caching (30s/60s/0s stale times).
- **Phase 4**: Dodo Payments integration (Vercel API routes for session creation + webhook fulfillment).

**Lesson**: Bi-directional sync with webhooks requires **idempotent event handlers** and **advisory locks** to prevent race conditions.

### 6.1 Subscription Management Refactoring

**Problem**: 250-line `ManageView` component mixed API logic, state management, and UI rendering. Cancel flow was untestable and unreusable.

**Solution**: Extracted `useCancelSubscription()` hook. Component calls hook for cancel state + toast notifications; hook is independently testable and reusable.

**Lesson**: Separate concerns early. Logic that will be reused across UIs should be a hook, not a component method.

### 6.2 Webhook Idempotency & Security

**Problem 1: Replay Attacks** — Duplicate webhook events (due to network retries) could double-credit topups.

**Solution**: `processed_payments` table with payment_id PRIMARY KEY. Before crediting, INSERT the payment_id. Unique constraint violation = already processed → return 200 without crediting.

**Problem 2: TOCTOU in Render Job Limits** — SELECT concurrent_count, then INSERT could race with another request, allowing users to exceed their parallel render limit.

**Solution**: Postgres RPC with advisory lock (`pg_advisory_xact_lock(hashtext(user_id))`) ensures count check + INSERT happen atomically.

**Problem 3: Infinite Credit Generation** — Negative `durationSec` in render dispatch → negative `totalCredits` → user effectively credited.

**Solution**: Explicit `durationSec <= 0` guard before any credit/job logic.

**Key Lesson**: **Client-side validation is UX; server-side validation is security.** Always validate on the backend.

### 6.3 Open Redirect + Token Leakage

**Problem**: `api/dodo-create-session.ts` forwarded client-provided `returnUrl` and `cancelUrl` directly to Dodo without validation. Attacker could craft checkout with malicious redirect to exfiltrate tokens.

**Solution**: 
- Removed client-side URL parameters.
- Server constructs canonically: `${APP_URL}?checkout=success` or error URL.
- If Dodo needs custom redirects in future, validate against explicit whitelist.

**Key Lesson**: Never trust redirect URLs from clients. Use canonicalized URLs or whitelists.

### 6.4 RLS Policy Loophole (Critical)

**Problem**: Initial schema used `FOR ALL` policies with only `USING` clause. Authenticated users could UPDATE their own rows directly from browser (e.g., set `purchased_credits = 999999`).

**Solution** (Migration 005): Dropped `FOR ALL` policies. Replaced with `FOR SELECT` only — clients can read but not write. All provisioning is server-side (webhook handlers use service role, which bypasses RLS).

**Key Lesson**: RLS `USING` alone is not enough. You need `WITH CHECK` for UPDATE/INSERT or restrictive policies that omit write clauses entirely.

### 6.5 Cloud Rendering Pipeline

**Architecture**:
1. User clicks "Export" → `ExportModal` collects frame range, resolution, FPS.
2. `api/render-dispatch.ts` validates, deducts credits, inserts `render_jobs` row, POSTs config to Modal (headless renderer).
3. Modal worker encodes frames, POSTs blob to presigned DigitalOcean Spaces URL.
4. Dodo webhook receives render status updates → updates `render_jobs` table.
5. **"My Renders"** modal fetches jobs, displays status (Queued/Rendering/Done/Failed) + download links.

**Key Design**: **Presigned S3 URLs** let the renderer bypass Vercel's request size limits. Videos expire after 24 hours.

**Two-Phase Progress Reporting**: `onProgress(pct, phase)` with `'prewarm' | 'capture'` phases for precise UI feedback.

**Tile Cache Prewarm**: 24-frame scrub before actual capture, waiting for `map.once('idle')` (max 2s/frame) to pre-load tiles.

**Encoder Back-Pressure**: Monitor `videoEncoder.encodeQueueSize`. If > 8, wait via requestAnimationFrame drain loop until <= 4 before encoding next frame.

### 6.6 Export & Snapshot Services

**Lesson Learned**: Multiple UI entry points (video export, snapshot) both need map resizing + frame compositing → extract shared utilities.

**Solution**: 
- `src/services/mapCapture.ts`: Shared `compositeFrame()` + `withMapResized()`.
- `src/services/videoExport.ts`: Uses shared utilities; phases: initEncoder → captureFrame loop → finalizeExport.
- `src/services/snapshot.ts`: High-res PNG capture (new). Respects manual camera position (ignores keyframe interpolation).

**Why `preserveDrawingBuffer = true`?** Allows reliable canvas capture during export/snapshots. ~1-2% GPU overhead on modern hardware (acceptable trade-off).

### 6.7 Vehicle & Route Animation Fixes

**Problem 1: Vehicle Visibility Decoupled** — Vehicles remained visible at route start/end even when route line was hidden (before `startTime` or after `endTime`). They also ignored "fade" exit animations.

**Solution** (RouteLayerGroup.tsx):
- Imperative visibility guard: toggle vehicle `visibility` based on playheadTime + time window.
- Opacity sync: vehicles fade out during `fade` exit animations.
- Comet mode guard: explicitly hide vehicle at progress = 0 to prevent ghosting.

**Problem 2: Broken Dash Pattern** — Route Inspector allowed users to select dashed/dotted styles, but Mapbox layers weren't applying `line-dasharray`.

**Solution**: Integrated `line-dasharray` into imperative sync loop. Added glow parity (glow layer inherits dash pattern). Equality guard skips redundant updates.

**Eraser Animation**: Redefined `reverse` exit animation for routes and boundaries as forward "erasers" (remove geometry from start → end over 0.5s) instead of retracting from the tip.

### 6.8 Mobile Viewport Height & Safe Areas

**Problem**: Root container used `h-screen` (100vh), which includes area hidden behind dynamic address bar on mobile. Bottom-anchored UI (timeline) was obscured.

**Solution**:
- Replaced `h-screen` with **`h-dvh`** (Dynamic Viewport Height).
- Added **`viewport-fit=cover`** to index.html.
- Implemented **`env(safe-area-inset-top/bottom)`** in Toolbar, Timeline, Toasts for notch/home indicator support.

**Result**: App auto-resizes as browser chrome collapses/expands. Works on all modern mobile browsers.

### 6.9 Timeline & Zen Mode Efficiency

**Problem**: Mobile/tablet interfaces were cramped; redundant text wasted space.

**Solution**:
- **Mobile Timeline**: Removed redundant "Timeline" label. Left-anchored transport controls. Time readout moved to previously empty sticky column.
- **Zen Mode**: Repositioned controls to top-right for all devices. Reordered to prioritize Play/Pause.
- New Camera button triggers **Snapshot Service** for high-res stills.

---

## 7. Critical Implementation Notes

### 7.1 Search & Geocoding

- **Search Box API**: Uses session-based pricing. Searches **triggered only on Enter key** (not onChange) to prevent UI flickering during rapid typing.
- **Viewport Proximity Bias**: Searches favor results near `mapCenter` for local relevance.
- **Shared Geocoding**: Centralized in `SearchField.tsx` + `BoundarySearch.tsx`.
- **POI Coverage**: Search Box API includes improved `place_formatted` secondary text vs. legacy Geocoding v5.

### 7.2 Callout Styling

- **Four Variants**: Default (sharp rectangle), Modern (pill + glow), News (left accent bar), Topo (border + elevation metadata).
- **Title Linking**: If `linkTitleToLocation` enabled, callout title auto-syncs with geocoded location name.
- **Animations**: Simple fade in/out (no scale/slide variants exposed in UI).

### 7.3 3D Vehicles & Flight Arcs

- **3D Vehicles**: Gated as PRO feature in Inspector (toggle + scale controls disabled with "PRO" badge).
- **Flight Arcs**: Generated via `@turf/great-circle` with parabolic altitude curve.
- **Land Routes**: Use Mapbox Directions v5.

### 7.4 Map Sync Engine

The Mapbox Sync Engine is exposed on the map instance as `_syncRef` to allow the Export Engine to force-synchronize styles during frame capture (necessary for consistent rendering across multiple frames).

### 7.5 Common Gotchas

- **Scrollbar Aesthetics**: Hidden in search menus via CSS (`scrollbar-width: none`) to maintain clean design.
- **Move Mode UX**: During "Pick on Map" or "Move Mode", input fields pulse with "Click on map..." placeholder + disabled state.
- **Session Pricing**: Search Box API session tokens are scoped per `SearchSession` instance to prevent cross-component token reuse.

---

## 8. For Future Maintainers

When adding features or refactoring:

1. **Preserve Zustand Selector Optimization**: New components reading frequently-updated store fields (e.g., `playheadTime`) should use `useShallow` selectors.
2. **Idempotent Webhooks**: If adding new webhook events, ensure handlers can be safely replayed (use unique constraints or version keys).
3. **Transient State Clarity**: Keep UI state out of the persisted `Project` type. This keeps save files small and UI fresh on load.
4. **Shared Utilities**: Before duplicating geocoding, map resizing, or frame compositing logic across components, extract to a hook or service.
5. **Server-Side Validation**: Always validate critical operations (credits, limits, data mutations) on the backend, regardless of client checks.

---

*This guide is maintained for AI agents and human developers alike. If you change a core architectural pattern, please update this file.*