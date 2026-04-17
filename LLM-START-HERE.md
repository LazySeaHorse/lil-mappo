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
- **Payment Strategy**: Dodo Payments integration with a B.Y.O.K option to offload infra costs.

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
- **Quotas & Limits**: Custom enforcement for map loads, cloud saves, and export quality based on user tier and BYOK status.

---

## 3. Core Architecture

The application is built around a **state-driven animation engine**.

### 3.1 The Brain: `src/store/useProjectStore.ts`

Everything lives in a single Zustand store. The `Project` type contains **only essential animation data**. Transient UI state lives alongside but is never persisted.

**Persisted (Project)**:
- `items`, `itemOrder`: Timeline elements (Routes, Boundaries, Callouts, Camera).
- `duration`, `fps`, `resolution`: Export settings. **Default: 30s, 30fps, 720p (1280×720).**
- `projection`, `lightPreset`, `starIntensity`, `fogColor`, `terrainExaggeration`: Environment.
- `mapCenter`: For search proximity bias.

**Transient (UI State — NOT persisted)**:
- `mapStyle`, `labelVisibility`, `playheadTime`, `isInspectorOpen`, `timelineHeight`, selection state (selectedItemId, selectedKeyframeId, selectedAutoCamRouteId), drafting state (search results, preview geometries).

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
- After signup, domain-level allowlist is enforced both on the frontend and via Supabase Auth Hooks.
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
- **Phase 5 (Refactor)**: Transition to the New Payment Model (April 2026).

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

### 6.4a Cloud Projects: RLS COUNT(*) Race Condition Fix

**Problem**: Migration 015's `cloud_projects_insert` policy used `COUNT(*) < 3` to enforce the free-tier 3-save limit. Under MVCC, concurrent transactions each see a snapshot of committed rows — a user firing 5 simultaneous saves could have all 5 pass the count check before any commit, exceeding the limit.

**Solution** (Migration 017): Replaced the direct INSERT path with a SECURITY DEFINER RPC `upsert_cloud_project` that:
- Acquires `pg_advisory_xact_lock(hashtext(user_id))` before counting (same pattern as `create_render_job` from Migration 012)
- Checks the limit atomically inside the lock — concurrent calls queue, guaranteeing no race
- Dropped the direct INSERT policy so clients must call the RPC (which bypasses RLS due to SECURITY DEFINER)

**Client Update**: `saveProjectToCloud()` in `cloudProjectLibrary.ts` now calls `supabase.rpc('upsert_cloud_project', {...})` instead of `.upsert()`.

**Security Update** (Migration 019): Added `IF auth.uid() != p_user_id THEN RAISE EXCEPTION 'unauthorized'; END IF;` as the first statement in the RPC. SECURITY DEFINER bypasses RLS, so explicit caller identity validation is required — never assume a user_id parameter is trustworthy.

**Key Lesson**: COUNT(*) checks in RLS policies are inherently racy under concurrency. Use atomic RPC functions with advisory locks for critical limits. SECURITY DEFINER functions must explicitly validate caller identity.

### 6.4b Webhook Error Handling: handleSubscriptionCancelled

**Problem**: The `handleSubscriptionCancelled` webhook handler in `dodo-webhook.ts` never checked for DB errors. If the UPDATE failed, the function returned 200 anyway — Dodo considered the event processed and wouldn't retry, leaving the subscription stuck in `'cancelling'` state.

**Solution**: Added error destructuring and throw pattern matching all other handlers. DB failures now cause a 500, triggering Dodo's retry logic.

**Key Lesson**: Webhook handlers must fail loudly on DB errors so the payment provider retries. Silently succeeding masks data corruption.

### 6.5 Cloud Rendering Pipeline

**⚠️ STATUS: Temporarily disabled in the UI.** The pipeline is fully implemented and functional but produces poor quality output because headless Chromium on Modal falls back to SwiftShader (CPU software rasterizer) instead of using the GPU. GPU acceleration requires NVIDIA's rendering stack (OpenGL/Vulkan ICD) which is not available in Modal's standard CUDA containers. Re-enable once this is resolved.

**What's disabled (commented out, not deleted)**:
- Cloud Render button in `ExportModal` (shows "soon™" for now)
- My Renders menu item in `AvatarMenu`
- Wanderer is currently the ONLY paid tier ($7/mo). Cartographer and Pioneer remain disabled.
- Top Up Credits tab in `CreditsModal`

**Architecture**:
1. User clicks "Export" → `ExportModal` collects frame range, resolution, FPS.
2. `api/render-dispatch.ts` validates, deducts credits, inserts `render_jobs` row, POSTs `{ jobId, renderSecret }` to Modal.
3. Modal's `dispatch_render` (FastAPI endpoint) spawns `run_render_background` fire-and-forget.
4. `run_render_background` boots headless Chromium (SwiftShader), loads app in render mode via `?render_job=&render_secret=` URL params.
5. `HeadlessRenderer.tsx` runs the WebCodecs export pipeline, triggers a browser download of the MP4 blob.
6. Playwright intercepts the download and saves to `/tmp/{jobId}.mp4`.
7. Python calls `api/render-presign` (Vercel) via urllib to get a presigned DO Spaces PUT URL, then uploads via `curl`.
8. Python calls `api/render-complete` (Vercel) with the output URL.
9. **"My Renders"** modal fetches jobs, displays status (Queued/Rendering/Done/Failed) + download links.

**Key Design**: Upload goes Modal → Vercel (presign) → curl PUT to DO Spaces. The Modal worker never holds DO Spaces credentials — Vercel generates the presigned URL server-side. This avoids DNS resolution issues for external hostnames inside the Modal container.

**Two-Phase Progress Reporting**: `onProgress(pct, phase)` with `'prewarm' | 'capture'` phases for precise UI feedback.

**Tile Cache Prewarm**: 24-frame scrub before actual capture, waiting for `map.once('idle')` (max 2s/frame) to pre-load tiles.

**Encoder Back-Pressure**: Monitor `videoEncoder.encodeQueueSize`. If > 8, wait via requestAnimationFrame drain loop until <= 4 before encoding next frame.

**WebCodecs config**: Codec Level 5.2 (`avc1.640034`). Relies on browser hardware encoder (no software fallback for cloud renders).

### 6.6 Export & Snapshot Services

**Lesson Learned**: Multiple UI entry points (video export, snapshot) both need map resizing + frame compositing → extract shared utilities.

**Solution**: 
- `src/services/mapCapture.ts`: Shared `compositeFrame()` + `withMapResized()`.
- `src/services/videoExport.ts`: Uses shared utilities; phases: initEncoder → captureFrame loop → finalizeExport.
- `src/services/snapshot.ts`: High-res PNG capture (new). Respects manual camera position (ignores keyframe interpolation).

**Why `preserveDrawingBuffer = true`?** Allows reliable canvas capture during export/snapshots. ~1-2% GPU overhead on modern hardware (acceptable trade-off).

**Resolution-Independent Framing (Zoom Offset)**: When rendering at a different resolution than the preview viewport, Mapbox GL JS shows a different geographic area at the same zoom level. For example, 4K (3840px) shows exactly twice as much as FHD (1920px).

**Solution**: Before resizing the map for export/snapshot, capture the preview viewport width and compute `zoomOffset = log2(renderWidth / previewWidth)`. Apply this offset to all camera zoom values during render. This preserves the "designed framing" regardless of output resolution. Example: FHD→4K gives `+1.0` zoom stop, which maintains identical visual composition.

- `videoExport.ts`: Threads `zoomOffset` through `prewarmTileCache()` and `captureFrame()`, applying it to keyframe-interpolated camera zoom.
- `snapshot.ts`: Adjusts live camera zoom after resize to preserve current view framing at higher resolution.

### 6.6a Video Export: H.264 Codec, Timestamp Precision & WebM Path Fixes

**Problem 1: Codec Level Mismatch + Hardware Rejection** — The encoder was hardcoded to request `avc1.640034` (H.264 Level 5.2). On hardware that rejects this level (or reports it as unsupported via `isConfigSupported()`), the encoder either failed silently or fell back to WebM without indication.

**Solution**: 
- Re-introduced `VideoEncoder.isConfigSupported()` as a probe (not a hard gate). `selectH264Codec()` tries Levels 5.2 → 5.1 → 4.2 → 4.0 in order, returning the best supported codec.
- If `isConfigSupported()` reports all levels as unsupported (false-negative on some hardware), fall back to Level 5.2 anyway — the try/catch in `initEncoder` still catches actual config failures.
- Added `onFormatDecided` callback: fires immediately after `initEncoder` with the actual format (`'mp4' | 'webm'`).
- UI now correctly reflects what actually initialized instead of guessing from API availability.

**Problem 2: Broken WebM Fallback (110-byte File)** — The `captureFrame` function for the MediaRecorder (WebM) path was creating a fresh `captureStream(0)` on every frame and calling `requestFrame()` on the wrong stream. The `MediaRecorder` was bound to a different stream (from `initEncoder`), so it never received frame signals, producing a hollow 110-byte header-only file.

**Solution**: 
- Include `mediaStream` in the `encoder` parameter's Pick type for `captureFrame`.
- Call `requestFrame()` on the track from the correct `mediaStream` (the one the recorder is actually bound to).
- Frames now flow correctly to the MediaRecorder, producing valid WebM files.

**Problem 3: Floating-Point Microsecond Timestamps** — The timestamp calculation `frameIndex * (1_000_000 / fps)` produced non-integers (e.g., 33333.33... for 30fps), violating the WebCodecs spec which requires integer microseconds. While most browsers truncated silently, strict decoders could reject the file as malformed.

**Solution**: Precompute `frameDuration = Math.round(1_000_000 / fps)` once and use `frameIndex * frameDuration` for all timestamps. Ensures all microsecond values are integers and perfectly consistent across the video.

**Key Files**: `src/services/videoExport.ts` (codec probe, encoder init, frame capture).

### 6.6b Video Export: Profile-Aware Codec Probing & MediaRecorder Removal (April 2026)

**Problem 1: H.264 Codec Probe Did Not Cover Profile Tiers** — `selectH264Codec()` only probed High Profile (`0x64`) codec strings: `avc1.640034/640033/64002A/640028`. On hardware/drivers where the GPU encoder rejects High Profile but accepts Main or Baseline, all four probes returned `false`. The false-negative fallback then picked `avc1.640034` (the worst possible choice), `videoEncoder.configure()` threw, and the silent catch block fell back to MediaRecorder WebM.

**Impact**: Users on modern browsers with full WebCodecs API support still got choppy WebM instead of MP4 if their GPU/driver didn't advertise High Profile support.

**Solution**:
- Expanded codec candidates to cover all three profile tiers: High (Levels 5.2 → 4.0), Main (Levels 4.2 → 4.0), Baseline (Levels 4.0 → 3.0). Total of 9 candidates.
- Changed the false-negative fallback from `avc1.640034` to `avc1.42E01E` (Baseline Level 3.0) — the most universally supported H.264 codec across all encoders.
- Now the probe has a high probability of finding at least one supported codec string across any modern hardware.

**Problem 2: MediaRecorder Fallback Is Fundamentally Broken for Offline Rendering** — `MediaRecorder` is a real-time recorder that timestamps frames using wall-clock time via `requestFrame()`. Since each frame can take 0–5 seconds to render (waiting for map idle, tile loads, etc.), the resulting video has completely non-uniform frame durations. This causes visible choppiness and broken playback; the problem is not fixable without a WebM muxer library.

**Impact**: Even when H.264 was unavailable (rare on Chrome 94+), the fallback produced an unwatchable file, damaging user confidence in the tool.

**Solution**:
- Removed the MediaRecorder fallback entirely. `initEncoder()` now throws with a clear, actionable error if H.264 initialization fails.
- UI disables the Export button and shows a message if WebCodecs is unavailable (non-Chrome browsers, or old versions).
- Users in unsupported browsers are directed to Cloud Render instead.
- Removed `recordedChunks`, `mediaRecorder`, and `mediaStream` from `EncoderState`.

**Problem 3: Dynamic Import of mp4-muxer Failed at Runtime** — The original code used `await import('mp4-muxer')` inside `initEncoder()`. Browsers cannot resolve bare module specifiers at runtime — this is the bundler's job, and it only works for static imports. The dynamic import failed silently, the catch block swallowed the error, and the code fell through to MediaRecorder every single time, regardless of codec support.

**Impact**: This was the PRIMARY root cause of all WebM output. Even if H.264 would have worked, the muxer wasn't loading.

**Solution**:
- Changed to static import at module top: `import { Muxer, ArrayBufferTarget } from 'mp4-muxer'`
- Vite now bundles mp4-muxer at build time, eliminating runtime resolution entirely.

**Key Changes**:
- `src/services/videoExport.ts`: 9-candidate codec probe, removed MediaRecorder path, static mp4-muxer import, errors now throw instead of silently falling back.
- `src/components/ExportModal/ExportModal.tsx`: Export button disabled if `typeof VideoEncoder === 'undefined'`; error message is clear and actionable.
- Removed `onFormatDecided` callback (now always MP4 or error, never WebM).

**Key Lessons**: 
1. Bare module specifiers can only be resolved by bundlers at build time (static imports). Dynamic imports in the browser fail silently.
2. When a fallback produces worse user experience than a clear error, remove the fallback. Broken output damages trust more than no output with a helpful message.
3. Silent catch blocks hide critical failures. Always surface errors or log them for debugging.

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

### 6.10 New Payment Model (April 2026 Refactor)

**Problem**: Mapbox costs and broken cloud renders necessitated a limit-heavy model to ensure sustainability.

**Solution**:
- **Guest Users**: Restricted to 3 map loads (tracked in `localStorage`). Blocked from exporting or saving projects.
- **Free Signed-in Users**: 50 map loads/month (server-tracked). Throttled to 3 loads/day after 30 monthly loads. Limited to 3 cloud saves, 30s timeline duration, and 720p 30fps exports.
- **Wanderer ($7/mo)**: Unlimited map loads, unlimited cloud saves, unlimited quality settings.
- **BYOK (Bring Your Own Key)**: Lifts map load counter and quality/duration limits for *all* users (even guests). Blacklists the app's own key to prevent token theft/bypass.
- **Implementation**: `src/lib/cloudAccess.ts` provides the logic; `src/hooks/useMapLoadGate.ts` and `src/components/MapLoadGate.tsx` enforce the map mounting logic.
- **Expiry Logic**: `api/dodo-webhook.ts` now deletes the subscription row on expiry, effectively dropping the user to the free tier (rather than the legacy 'Nomad' tier).
- **Cleanup**: The daily account purge (`api/cleanup-free-accounts.ts`) is temporarily disabled via early return and `vercel.json` cron removal to allow free users to exist while cloud renders are broken.

### 6.11 BYOK Security: Blacklist Enforcement + Quota Fail-Closed

**Problem 1: BYOK Blacklist Bypass** — The `BYOKQuickEntry` component in `MapLoadGate.tsx` (shown when a free user hits monthly quota) allowed pasting the app's own Mapbox key without validation. A user could extract `VITE_MAPBOX_TOKEN` from the Network tab and paste it as "BYOK" to bypass all limits.

**Solution**: Added `isAppOwnKey()` check in `BYOKQuickEntry.handleSave()` before accepting the key. Shows inline error if matched. This mirrors the check in `AccountSettingsModal` (now enforced consistently).

**Problem 2: Quota Fail-Open Bypass** — The original `useMapLoadGate.ts` caught network errors from `/api/track-map-load` and silently allowed the map to load ("fail open" for availability). A user with a browser extension could block the tracking request and get unlimited free loads.

**Solution**: Changed to fail-closed — network errors now set `blocked: true` / `reason: 'quota_error'`, showing a "Something went wrong" screen with a Retry button. This is justified because:
- Vercel + Supabase outages are rare (<1% of the time)
- Blocking a handful of legitimate users for minutes during an outage is better than silently allowing unlimited free usage
- The tradeoff favors security over perfect availability

**UI Changes**: New `quota_error` reason type in `MapGateReason` union. `MapLoadBlockedScreen` shows a friendly retry screen with a `window.location.reload()` button (re-runs the quota check from scratch).

**Key Lesson**: Fail-open strategies are appropriate for audit logs or observability, not for security gatekeeping. Quota systems should fail-closed.

### 6.12 Security Hardening: Four Critical Fixes (Migrations 018-019)

**Problem 1: BYOK Blacklist Bypass via localStorage** — While `BYOKQuickEntry` and `AccountSettingsModal` validated that pasted tokens weren't the app's own key, a user opening DevTools could directly write the app's key to localStorage via `localStorage.setItem('lil-mappo-mapbox-token', '<app-key>')`. The underlying `hasByok()` function only checked token existence, not validity.

**Solution** (cloudAccess.ts): Added `isAppOwnKey(token)` check inside `hasByok()`. Now returns `false` if the stored token matches the app's own key, regardless of how it was stored. Quota tracking is correctly re-enabled.

**Problem 2: upsert_cloud_project RPC lacked caller identity check** — The RPC is `SECURITY DEFINER` (bypasses RLS) and accepts `p_user_id` as a parameter, but never verified it matched `auth.uid()`. An authenticated user knowing another user's UUID could inject new projects into that user's namespace or overwrite existing projects.

**Solution** (Migration 019): Added identity check as the first statement: `IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN RAISE EXCEPTION 'unauthorized'; END IF;`. Pattern mirrors server-side JWT verification in API routes.

**Problem 3: track_map_load RPC lacked advisory locks** — Unlike `create_render_job` and `upsert_cloud_project`, the RPC did SELECT → check quota → UPDATE without holding a lock. Concurrent page loads by the same user could both read the same counter snapshot, both pass the quota check, and both increment — allowing a slight over-count at boundaries.

**Solution** (Migration 018): Added `PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT));` as the first statement. Concurrent calls queue behind the first, guaranteeing atomicity. Matches the established pattern in Migrations 012 and 017.

**Problem 4: track-map-load API endpoint failed open on DB error** — The backend returned `{ allowed: true, monthly_total: 0, daily_total: 0 }` when the RPC threw a DB error. While `useMapLoadGate.ts` was updated to fail-closed on network errors, the backend explicitly granted access on internal failures — bypassing the quota system.

**Solution** (api/track-map-load.ts): Changed error handler to return `res.status(500).json({ error: "quota_unavailable" })`. The frontend's `.catch()` handler correctly interprets a 500 as quota_error → blocks the map. Creates a consistent fail-closed behavior across the system.

**Key Lesson**: SECURITY DEFINER functions must explicitly validate caller identity (don't rely on RLS). Always use advisory locks for critical counters. Fail closed on errors in security-critical paths.

### 6.13 Three Client-Side Security Fixes (April 2026)

**Problem 1: Quota Tracking Bypass via Token Spoofing (Critical)** — The gate (`useMapLoadGate`) and the map (`MapViewport`) each independently called `localStorage.getItem(BYOK_STORAGE_KEY)` to determine whether the user was using BYOK. An attacker could override `localStorage.getItem` in the DevTools console to return a dummy token during the gate check (bypassing quota tracking) and then return `null` afterward (causing the map to fall back to the app's built-in token), achieving unlimited free loads on the app's bill.

**Solution**: Single atomic read in `useMapLoadGate.ts`:
- When the gate resolves, read `localStorage.getItem(BYOK_STORAGE_KEY)` **exactly once**
- Derive both the `byok` flag (with `isAppOwnKey()` validation) AND the `mapboxToken` from that single read
- Expose `mapboxToken` in the gate state and pass it directly to `MapViewport` as a prop
- `MapViewport` no longer calls `getEffectiveMapboxToken()` — it uses the snapshotted token from the gate
- If an attacker has a dummy token in localStorage at gate-check time, the map receives the dummy → tiles fail to load → no working map
- If an attacker wants a working map, they must not have a dummy token → `hasByok()` returns false → quota is tracked

**Key Changes**: `useMapLoadGate.ts` (snapshot token), `MapViewport.tsx` (accept token prop), `MapStudioEditor.tsx` (pass token to map).

**Problem 2: Stolen Paid Time (Low/UX)** — The `subscription.cancelled` webhook handler immediately set the subscription status to `'cancelled'`. However, the quota system and frontend only recognized `'active'` or `'cancelling'` as paid states. Users lost access to their paid features the moment they clicked "Cancel" in the UI, rather than at the end of their billing period.

**Solution** (api/dodo-webhook.ts): Changed `handleSubscriptionCancelled` to set status to `'cancelling'` (not `'cancelled'`). The existing `handleSubscriptionExpired` webhook (fired by Dodo at period end) already deletes the subscription row, dropping the user to the free tier. Now the flow is:
1. User hits Cancel → webhook sets status = `'cancelling'` → user keeps access during paid period
2. Renewal date arrives → Dodo fires `subscription.expired` → subscription row deleted → user drops to free tier

**Problem 3: Client-Side Export Limits (Low)** — Export resolution, FPS, and duration limits were enforced only in the React UI (disabled buttons for free users). A user could use DevTools to override `exportResolution: '2160p'` in the store, bypassing the UI restriction and exporting at premium quality for free.

**Solution** (ExportModal.tsx): In `handleExport`, **before** calling `runExport()`, silently clamp the resolved render config to the user's tier limits:
- Compare `exportResolution` against `limits.maxResolution`
- Compare `fps` against `limits.maxFps`
- Clamp `endTime` to `limits.maxDuration`
- If a value exceeds the limit, silently downgrade to the free-tier value (no error toast)
- This gracefully handles both DevTools tampering and projects authored on a higher tier the user has since downgraded from

**Key Lesson**: Client-side validation is UX enforcement; server-side/encode-time validation is security enforcement. Tier limits on exports must be re-checked at encode time, not just at UI-render time. For quota bypass attacks with multiple timing windows (gate vs. map creation), snapshot the security-relevant decision and pass it forward instead of re-evaluating independently.

### 6.14 AutoCam: Route-Driven Camera Engine (April 2026)

**Problem**: Manually keyframing long, complex routes (like cross-country drives or high-altitude flight arcs) is tedious and hard to keep smooth.

**Solution**: Integrated an AutoCam system that derives camera state directly from route geometries.

- **Dual Output Modes**: 
  - `jumpTo`: Standard center/zoom/pitch/bearing (used for **Navigation** mode).
  - `freeCam`: Uses Mapbox `FreeCameraOptions` (3D position + look-at) for **Cinematic** mode, allowing true camera-behind-vehicle framing.
- **Interpolation & Blending**:
  - `getCameraAtTime` (in `cameraInterpolation.ts`) prioritized active AutoCam blocks.
  - A 0.5s `BLEND` window handles smooth eases between manual keyframes and AutoCam start/end points using `lerpJumpTo`.
  - Manual keyframes located *inside* an AutoCam route's time window are ignored to prevent conflicting signals.
- **Shared Application**: `applyCamera()` utility standardizes how camera outputs are applied to the map instance in both `usePlayback.ts` and `videoExport.ts`.
- **Pre-warming & Exports**: `videoExport.ts` now passes the full routes list to the interpolation engine, ensuring "Pre-warm" correctly samples tiles along automated paths before capture.

**Key Files**: `cameraInterpolation.ts` (logic), `AutoCamInspector.tsx` (UI), `usePlayback.ts` / `videoExport.ts` (application).

**Key Lesson**: When adding complex automated behaviors that override manual defaults, implement a dedicated "blend" layer rather than binary switching to avoid jarring "camera jerks" at transition boundaries.


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

### 7.3 B.Y.O.K. (Bring Your Own Key)

- **Storage**: Key is stored in `localStorage` under `BYOK_STORAGE_KEY`.
- **Security**: The app blacklists its own `VITE_MAPBOX_TOKEN` for BYOK to prevent users from just copying the app's key to bypass limits. The check runs in `hasByok()` in `cloudAccess.ts` (not just in UI handlers), so localStorage tampering is caught at the quota-logic layer.
- **UI Validation**: `BYOKQuickEntry` (in `MapLoadGate.tsx`) and `AccountSettingsModal` both call `isAppOwnKey()` before accepting pasted tokens, providing immediate feedback.
- **UX**: Updating or clearing the key triggers a page reload to re-initialize the Mapbox instance with the new token.

### 7.4 3D Vehicles & Flight Arcs

- **3D Vehicles**: Gated as PRO feature in Inspector (toggle + scale controls disabled for free users).
- **Flight Arcs**: Generated via `@turf/great-circle` with parabolic altitude curve.
- **Land Routes**: Use Mapbox Directions v5.

### 7.4 Map Sync Engine

The Mapbox Sync Engine is exposed on the map instance as `_syncRef` to allow the Export Engine to force-synchronize styles during frame capture (necessary for consistent rendering across multiple frames).

### 7.5 Common Gotchas

- **Scrollbar Aesthetics**: Hidden in search menus via CSS (`scrollbar-width: none`) to maintain clean design.
- **Move Mode UX**: During "Pick on Map" or "Move Mode", input fields pulse with "Click on map..." placeholder + disabled state.
- **Session Pricing**: Search Box API session tokens are scoped per `SearchSession` instance to prevent cross-component token reuse.

### 7.6 Anti-Abuse & Email Allowlist

- **Problem**: Spam account creation using disposable email services.
- **Solution**: `src/lib/emailAllowlist.ts` maintains a list of ~14 trusted domains (Gmail, Outlook, etc.).
- **Enforcement**:
    - **Frontend**: `AuthModal.tsx` checks the email before calling Supabase signup.
    - **Server-side**: Supabase "Before user creation" Auth Hook (Migration 016) rejects signups from blacklisted domains.
- **Obfuscation**: Production builds use `rollup-plugin-obfuscator` to make reverse-engineering client-side limits harder (Phase 10).

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