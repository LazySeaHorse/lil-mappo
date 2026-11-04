# Demo mode (`demo` branch only)

`demo.lilmappo.tech` (Vercel deployment protection, owner only) replays a project file as if someone were building it: map style and settings, boundaries, routes, callouts, 3D models, timeline tweaks, camera views, playback, then a fake export. A widget at the top controls it; mock AI mode shows a mock Claude Code window driving the app instead of the cursor.

This branch is `preview` plus demo commits. Merge `preview` into `demo` from time to time; keep demo changes to existing files small so merges stay painless. Never merge `demo` into `preview` or `main`: its `vercel.json` differs (demo build command, the frame may be framed by its own origin).

## Build and deploy

- Build flag: `VITE_DEMO=1` (`npm run dev:demo`, `npm run build:demo`). Every demo path is behind `IS_DEMO` (`src/demo/isDemo.ts`), so prod builds drop it. Demo builds skip the obfuscator.
- The demo never talks to the prod database. Leave the Supabase env vars unset for the `demo` branch in Vercel (the demo build does not need them; `VITE_MAPBOX_TOKEN` is still required).
- **Private bundle.** The fake Supabase client (fake signed-in "li'l Mappo" user with a Wanderer plan, which also opens every Pro gate) is not in this repo. It lives in the gitignored `src/demo/private/`. `vite.config.ts` aliases `@/lib/supabase` to `src/demo/private/supabase.ts` in demo builds, fails if that file is missing, and fails if anything reaches `src/lib/supabase.ts` another way, so a demo build can never fall back to the real client. Locally, keep your copy of the folder in place to run `dev:demo`.
- On Vercel, `buildCommand` runs `scripts/demo-vercel-build.sh`: it fails if `DEMO_PRIVATE_BUNDLE` is unset, unpacks it into `src/demo/private/`, then runs `VITE_DEMO=1 npm run build`.
- To update the env var: `bash scripts/demo-pack-private.sh` prints the value (and its size on stderr; Vercel allows 64 KB of env vars in all). Paste it into Vercel → Project → Settings → Environment Variables → `DEMO_PRIVATE_BUNDLE`, scoped to Preview, branch `demo`, then redeploy.
- The frame is a same-origin iframe, so this branch's `vercel.json` sends `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`.

## Architecture

Two pages, same origin:

- **Shell** (top-level `/`): wallpaper, the stage (the project's aspect ratio, letterboxed in the browser), a Mac window (or a phone, for portrait projects) holding the frame iframe, the mock Claude Code Mac window on the left in AI mode (the app window shrinks), the widget (dismissable, shortcut to bring it back) and the 3-2-1 countdown. Code: `src/demo/shell/`.
- **Frame** (`/?demo-frame`, in the iframe): the real app plus `DemoFrame`, which owns the input blocker (trusted user input is swallowed; the driver's synthetic events pass), the macOS cursor, the fetch mocks (search, geocoding, directions answered from the loaded file, no network), the step planner and the step runners. Code: `src/demo/frame/`.
- They talk through `src/demo/protocol.ts` (postMessage, same origin). The shell never touches the app's store; the frame never draws chrome.

### How a run works

1. Shell sends `load` with the file. Frame parses it (`parseProjectDocument`), reports `loaded` (aspect, missing .glb models), and shows an empty project at the file's map centre.
2. Shell may send `relink-model` for each missing model.
3. `start` → countdown in the shell, then the frame runs the plan. Order: map style and settings → boundaries → routes → callouts → models → timeline tweaks → camera views → play from 0 → fake export.
4. Per item: the cursor clicks the real toolbar/menu/inspector controls; the final values are written to the store so the result matches the file exactly. Inspector edits are the fields that differ from what "Add" creates (`src/store/itemFactories.ts`).
5. Mock AI mode (`src/demo/frame/ai/`): the visible cursor clicks the AI toolbar button, flips AI control on in the panel, the bridge status is set to `connected` from demo code (the real bridge is not dialled), and the panel is closed again so the map has room; the status pill ("AI connected, N calls") stays. The cursor hides, the frame asks the shell to open the Claude Code window, the widget's prompt is typed there (the frame waits `typeChar` per character, as the shell types), and a script (`script.ts`, pure, built from the same plan) plays as agent turns: `text` lines built from item names, `thinking` beats, and real `runAgentTool` calls (`add_boundary`, `add_route`, `add_callout`, `add_camera_keyframe`, `update_project_settings`, `update_item`...) with the inputs an agent would send, each shown as `tool-start` / `tool-end`. Because they go through `runAgentTool`, the app's own AI feedback (select and pulse the item, follow the map, the pill) reacts as it does for a real agent. After an item's calls the file's exact item is swapped in as an AI write, so the end state equals the file; models cannot be added by any tool, so a loaded model is placed (as the user's write) and the agent only retimes it, and a model whose .glb is not loaded is skipped. The agent's last call is `set_playhead 0`; playback then starts directly (no tool plays, so the transcript shows nothing for it), the closing summary says the map is ready and `done` ends the turn (the terminal goes idle), and the run waits for the playback to finish before the final writes. The terminal reads like Claude Code: the spinner word changes with each model request (a thinking beat, a tool result) and shows a token counter, a thinking beat of a second or more leaves a dim `∴ Thought for Ns` line, and `done` ends the turn with a `✻ Worked for 2m 14s` footer (all pure state in `shell/transcript.ts`). Reset closes the panel, turns AI control off and the Claude Code window away.

### The phone layout

A portrait project runs in an iframe of phone width, so the app lays itself out as on a phone (`MOBILE_QUERY` in `src/constants/layout.ts`, the one `useResponsive` uses; `currentLocators()` asks it). The runners are the same; `PHONE_LOCATORS` and the taps in `phone.ts` get them to the controls:

- The collapsed toolbar shows one bar at a time. Add tools (route, boundary, callout, camera view, 3D model) are behind the "+" button, the map controls behind the Map Display button, Export on the main bar. Before using one, the runner calls `showAddBar` / `showMainBar` (the X button goes back to the main bar).
- The inspector is a drawer that covers the toolbar and replaces the timeline while it is open. `closeInspectorDrawer` taps the map above it (Escape, then the store, as fallbacks) before the toolbar or the timeline are needed again. Item steps leave it open after their edits, as selecting an item does.
- Map framing after a route import uses the phone's layout flags; the timeline's zoom fit uses the phone's wider timecode gutter.
- The phone's toolbar has no AI button or panel, so mock AI mode switches AI control on directly there (the terminal and the script are unchanged).
- Test with `setViewportWidth` (`testViewport.ts`) and the real `Toolbar` and `InspectorPanel` (`phone.test.tsx`).

### The end of a run

- **Timeline.** Item steps leave the timing the app gave the new item; the timeline step drags each clip (whole clip to move, edge handles to trim) to the file's start and end, zooming out with the real zoom button when needed. The final write makes the times exact.
- **Camera views.** Per view, in time order: click the ruler at its time, ease the map to it (`moveToCamera`), click Add camera view, edit what differs in the inspector (zoom, pitch, bearing, time, motion).
- **Play.** Jump to Start, Play, then wait the project's real length (not speed-scaled; pause holds playback, reset stops it).
- **Fake export.** The real export modal and Export button run their own flow; `useVideoExportExecution` loads `src/demo/frame/fakeExport.ts` instead of the encoder in the frame (`IS_DEMO_FRAME`) and skips `saveAs`. The bar fills on the run's clock. Needs a browser with `VideoEncoder` (the Export button is off without it).

## Auto zoom

Like Screen Studio's zoom-ins, for recorded videos: the camera moves toward the part of the app being worked on and eases back out. The frame says where to look; the shell moves the camera.

- **Frame.** `moveTo` (so click, type, sliders and drags) reports a focus through `ctx.focus`: the region the control belongs to, not the control (`frame/focus.ts`: its dialog, popup menu, inspector section, inspector panel, or the timeline strip, which is `wide` and gets only a gentle zoom). The driver posts it as a `focus` message in frame CSS px. Runners ask for the whole stage (`withFocusOut`) for map style and settings steps, map picks, camera view easing and playback, and the run starts, ends and resets on the whole stage.
- **Shell.** `shell/zoom.ts` is a pure director: it fits the region with padding (grown to a minimum share of the app so a lone button does not fill the screen), clamps to `[1, maxZoom]` and so the stage is always covered, holds still while a new region is comfortably in view (hysteresis), pans when it leaves, and goes back to 1x after an idle delay or at once on a `null` focus. `shell/layout.ts` (`frameToStage`) turns frame px into stage px (window bar in landscape; phone edge, status bar and scale in portrait). The result is one `translate() scale()` on the `.ds-zoom` layer inside the stage (wallpaper and windows; the shield and countdown stay put), eased for 700 ms / speed. No `will-change`: Chrome would keep a low-res raster and text goes soft when zoomed. The iframe never remounts.
- **Mock AI mode.** The frame's focus is ignored. The camera zooms to the top of the Claude Code window while the prompt is typed, and is at 1x from the moment it is sent.
- **Widget.** "Auto zoom" and "Max zoom" (1.2x to 2.5x, default 1.8x). Off mid-run eases back to 1x; Reset snaps; Pause holds.
- **Tuning.** The constants at the top of `shell/zoom.ts`: `ZOOM_PADDING`, `MIN_REGION_SHARE`, `WIDE_MAX_ZOOM`, `HYSTERESIS_MARGIN`, `SIMILAR_SCALE`, `IDLE_MS`, `TRANSITION_MS`; the easing curve is `.ds-zoom` in `shell/shell.css`; the region rules are `REGIONS` in `frame/focus.ts`.
- **Known limit: the map is soft when zoomed.** The Mapbox map is a WebGL canvas that CSS upsamples. mapbox-gl 3.32 has no public runtime API for the canvas pixel ratio (`devicePixelRatio` is read at construction), so it is not raised while zoomed; doing it would need private internals or remounting the map.
