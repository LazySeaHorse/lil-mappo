# li'l Mappo (Map Animation Studio)

li'l Mappo is a browser-based application. It creates map animations and exports them as video. Use the timeline to control camera movement, import routes, and add 3D callouts and boundaries.

[![Preview](https://i.postimg.cc/nhvCjTzX/redsfxfgdfbvcx.webp)](https://postimg.cc/bZwz4x1P)

## Features

### 1. Route Planning and Import
- **Import GPX and KML**: Import and animate route files.
- **Automated Routing**: Create car, walking, or flight paths with Mapbox Directions and Great Circle math.
- **Airport Search**: Search 7,697 global airports by IATA or ICAO code. The route snaps directly to runways.
- **3D Vehicles**: Display animated cars and airplanes that follow route lines and headings.
- **Animated Lines**: Draw lines progressively over time with customizable width, color, and glow effects.

### 2. Boundaries and Annotations
- **Boundary Search**: Find places with OpenStreetMap Nominatim. Animate boundary polygons.
- **3D Callout Cards**: Add 3D cards with images and text. Select coordinates directly on the map.
- **Manual Pick Mode**: Use a crosshair to set coordinates and move items on terrain.
- **Drafting Tools**: Search, style, and preview routes and boundaries before you add them to the timeline.

### 3. Camera Controls
- **Keyframe Timeline**: Control camera position, zoom, pitch, bearing, and altitude.
- **AutoCam Engine**: Track routes automatically with navigation and cinematic camera modes.
- **Interpolation**: Apply easing functions (Linear, Quad, Cubic, Sine) for smooth transitions.
- **Orbit Tool**: Generate keyframes to rotate the camera 360 degrees around a point.

### 4. Map Views
- **3D Terrain and Buildings**: Display Mapbox Terrain RGB and extruded 3D buildings.
- **Label Controls**: Toggle labels for places, roads, and points of interest.
- **Mapbox Standard Style**: Adjust light presets and 3D features with the Mapbox Config API.
- **Map Projections**: Switch between Globe and Mercator projections.
- **Zen Mode**: Hide interface panels to view only the map.

### 5. Media Export
- **Video Export**: Render MP4 video offline with the WebCodecs API and Mediabunny.
- **Output Settings**: Select resolutions up to 4K and frame rates of 30 or 60 frames per second.
- **Snapshot Export**: Capture high-resolution PNG images from any camera view.

## Tech Stack

- **Framework**: React 18 with Vite
- **State Management**: Zustand
- **Map Engine**: Mapbox GL JS v3 via `react-map-gl/mapbox`
- **Geospatial Processing**: Turf.js
- **Airport Search**: cmdk with local airport dataset
- **Video Export**: WebCodecs API, Mediabunny, and Canvas 2D
- **UI Components**: Radix UI primitives and Tailwind CSS
- **Icons**: Lucide React
- **Persistence**: IndexedDB and Supabase PostgreSQL
- **Testing**: Vitest and Playwright

## Architecture

The application runs as a state-driven animation engine. A single Zustand store manages timeline items (Routes, Boundaries, Callouts, Camera Keyframes) and the playhead time.

## Local Supabase

The repository includes a local Supabase configuration in Docker. It applies all database migrations and seeds two test accounts. It does not require production credentials. The start script binds published ports to `127.0.0.1` to protect local services.

```bash
npm run db:local:start
npm run db:local:reset
npm run db:local:status
```

Copy `.env.local.example` to `.env.local`. Replace the keys with values from `npm run db:local:status`. Vite gives `.env.local` priority over `.env`. This isolates local sessions from production Supabase.

Local service endpoints:

- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- Mailpit: `http://127.0.0.1:54324`

Test login credentials (password: `local-test-password`):

- `local-free@gmail.com`
- `local-wanderer@gmail.com`

Use only the `db:local:*` scripts for development and tests. Do not use `supabase link`, `supabase db push`, or `--linked`. Those commands target hosted projects.
