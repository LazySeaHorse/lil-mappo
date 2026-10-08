# li'l Mappo (Map Animation Studio)

li'l Mappo is a web application for map animation. You can animate camera movement, draw routes, add callout annotations, and export video files.

[![Preview](https://i.postimg.cc/nhvCjTzX/redsfxfgdfbvcx.webp)](https://postimg.cc/bZwz4x1P)

## Features

### 1. Route Planning and Import
- **Import GPX and KML**: Import and animate GPS route files.
- **Automated Routing**: Create road paths or flight paths with Mapbox Directions and Great Circle math.
- **Custom Walking Paths**: Build multi-point paths with interactive waypoints, drag-to-reorder controls, and Bezier spline curves.
- **Airport Search**: Search 7,697 global airports by IATA or ICAO code. Routes snap to airport runways automatically.
- **Airport Route Links**: URLs such as `/routes/jfk-to-lhr` open a new project with a 3D flight route and AutoCam enabled. See [`LLM-START-HERE.md`](LLM-START-HERE.md).
- **3D Vehicles**: Show animated 3D cars and airplanes that align with route heading and pitch.
- **Animated Lines**: Draw route lines over time with custom stroke widths, colors, and glow effects.

### 2. Annotations and Boundaries
- **Canvas 2D Scene Graph**: A fast callout overlay renders directly in the Mapbox render loop at native resolution.
- **12 Visual Styles**: Choose from 12 styles: Leader Line, Map Label, Target Lock, Editorial, Stamp, Flag, Polaroid, Big Number, Hand Drawn, Radius Ring, Waypoint, and Road Sign.
- **Screen-Space Altitude**: Pixel-based altitude controls prevent zoom drift and keep 3D terrain positions stable.
- **Boundary Search**: Search administrative boundaries with OpenStreetMap Nominatim. Animate boundary polygons on the map.
- **Manual Pick Mode**: Set coordinates with crosshairs directly on 3D terrain.
- **Drafting Tools**: Search, style, and preview routes and boundaries before you add them to the timeline.

### 3. Camera and Timeline
- **Keyframe Timeline**: Control position, zoom, pitch, bearing, and altitude across time.
- **AutoCam Engine**: AutoCam plans camera motion in video time. Fast playback of complex routes stays smooth.
- **Camera Views and Presets**: Select Navigation or Follow view. Choose from Chase, Drone, Reveal, or Top-Down presets.
- **Adaptive Framing**: The camera reacts to route turns, speed changes, and terrain elevation.
- **Interpolation**: Apply Linear, Quad, Cubic, or Sine easing curves for smooth transitions.
- **Orbit Tool**: Generate keyframes that rotate the camera 360 degrees around a target point.
- **Undo and Redo**: Manage project history with Zundo. The system coalesces pointer drag steps and tracks whether changes come from user or AI actions.

### 4. Map Styles and Views
- **14 Map Styles**: Choose from 7 standard styles (Standard, Streets, Outdoors, Light, Dark, Satellite, Satellite Streets) and 7 community styles (Nav Day, Nav Night, Black Marble, Vintage, Bubble, Water World, Neon Glow).
- **3D Terrain and Features**: Enable Mapbox Terrain-RGB, 3D extruded buildings, landmarks, trees, and architectural facades.
- **Dynamic Label Controls**: Show or hide labels for places, roads, transit, and points of interest. The project saves these settings.
- **Projections and Atmosphere**: Switch between Globe and Mercator projections. Adjust custom fog and light presets.
- **System Overlays**: Preview branding, Mapbox logos, and attribution in presentation mode. These overlays mirror video exports.
- **Zen Mode**: Hide interface panels to view the map without distraction.

### 5. Media Export and Rendering
- **Client-Side Video Export**: Render MP4 video files offline with the WebCodecs API and Mediabunny. Export up to 4K resolution at 30 or 60 frames per second.
- **Snapshot Export**: Save high-resolution PNG images from any camera position.
- **Cloud Rendering (Upcoming)**: A cloud GPU pipeline is in development. Users can vote for this feature in the app.

### 6. AI Agent Integration
- **WebMCP Support**: Connect browser-based agents directly through `document.modelContext` (for example, Gemini in Chrome).
- **Local MCP Bridge**: A Go bridge daemon in `bridge/` exposes tools to desktop coding agents (such as Claude Code or Antigravity) over WebSocket.
- **Agent Feed and Visuals**: Watch live agent actions in an event feed. View timeline pulses and undo AI changes in single steps.

### 7. Accounts and Cloud Storage
- **Authentication**: Sign in through Supabase Auth with email, Google OAuth, or GitHub OAuth.
- **Project Storage**: Save projects to local IndexedDB storage. Synchronize projects to Supabase PostgreSQL when signed in.
- **Subscriptions and Quotas**: Use Free or Wanderer subscription plans through Dodo Payments. Users can also provide their own Mapbox token (BYOK).

## Tech Stack

- **Frontend**: React 18, Vite, Zustand, Zundo, TanStack React Query
- **Map Engine**: Mapbox GL JS v3, `react-map-gl/mapbox`, Turf.js
- **Annotations**: Canvas 2D scene graph engine
- **Video Export**: WebCodecs API, Mediabunny, Canvas 2D
- **AI Protocols**: WebMCP browser standard and Go WebSocket bridge
- **Backend and Auth**: Supabase (PostgreSQL, Auth, Storage) and Vercel Serverless Functions
- **Payments**: Dodo Payments (hosted checkout and webhooks)
- **Analytics**: Optional PostHog (EU region, first-party proxy, lazy-loaded, signed-in users only)
- **UI and Styles**: Radix UI primitives, Tailwind CSS, Lucide React
- **Testing**: Vitest, Playwright, and fast-check property fuzz tests

## Architecture

The application runs as a state-driven animation engine:
- A central Zustand store holds timeline items (Routes, Boundaries, Callouts, Camera Keyframes), environment settings, and playhead time.
- The system separates persistent project data from temporary UI state.
- A temporal layer wraps the store to provide undo and redo actions.
- An off-DOM Canvas 2D scene graph draws map annotations in sync with the Mapbox camera.
- Transport-agnostic agent tools allow both browser and desktop AI agents to modify scenes through MCP.

## Development and Testing

### Prerequisites
- Node.js 18 or later
- Docker (for local Supabase services)

### Quick Start

```bash
# Install dependencies
npm install

# Start the local development server
npm run dev

# Build for production
npm run build

# Run code linter
npm run lint

# Run unit and integration tests
npm test

# Run browser smoke tests
npm run test:ui

# Run property-based fuzz tests
npm run test:fuzz
```

## Analytics (PostHog)

Product analytics is optional. Analytics remains off unless you set `VITE_POSTHOG_KEY` during build time.

When enabled, analytics runs only on `app.lilmappo.tech` and `preview.lilmappo.tech`. It never runs in development mode, under Playwright, or in automated browsers.

Privacy safeguards:
- The script loads only after user sign-in.
- The client uses no cookies.
- Requests pass through a first-party proxy at `/_m` to PostHog EU servers.
- The tracker identifies users only by user ID.
- The tracker never sends coordinates, project names, or user content.
- Session replay records signed-in users only.
- Session replay samples 50 percent of sessions and masks all text by default.
- Signed-out visitors increment only four aggregate counters.

Deployment prerequisite: Enable the "Discard client IP data" setting in your PostHog project settings. The proxy forwards client IP addresses, so the external service must discard them.

See [`LLM-START-HERE.md`](LLM-START-HERE.md) section 7.7 for event tables and masking rules.

## Upcoming Feature Votes

Users can vote for features that are not built yet. Unbuilt features show a heart button in the interface.

Signed-in users can click the heart button to open a preview modal and vote. The application displays coarse demand levels (such as "A few people want this") rather than raw vote counts.

Current vote candidates include Cloud Render and Example Projects.

See `src/config/upcomingFeatures.ts` and [`LLM-START-HERE.md`](LLM-START-HERE.md) section 7.8 for details.

## Local Supabase

The repository includes a local Supabase configuration that runs in Docker. It applies all database migrations and creates test accounts. The startup script binds ports to `127.0.0.1` to protect local services.

```bash
# Start local Supabase services
npm run db:local:start

# Show local status and API keys
npm run db:local:status

# Reset database migrations and seed data
npm run db:local:reset

# Run local database tests
npm run db:local:test

# Stop local Supabase services
npm run db:local:stop
```

Configuration steps:
1. Copy `.env.local.example` to `.env.local`.
2. Run `npm run db:local:status`.
3. Copy the output keys into `.env.local`.

Vite loads `.env.local` before `.env`. This isolates local test sessions from production services.

Local service endpoints:
- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- Mailpit: `http://127.0.0.1:54324`

Test user credentials (password: `local-test-password`):
- `local-free@gmail.com`
- `local-wanderer@gmail.com`

Use only the `npm run db:local:*` scripts for local development and testing. Do not use `supabase link` or `supabase db push`. Those commands target remote production projects.
