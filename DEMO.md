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
5. Mock AI mode: the cursor clicks the AI toolbar button and switches AI control on, then the frame asks the shell to open the Claude Code window, the prompt from the widget is typed there, and scripted `runAgentTool` calls build the project (no cursor). The frame streams `ai-event`s for the transcript.
