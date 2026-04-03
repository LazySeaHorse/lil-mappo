# Map Animation Studio (li'l Mappo)

A browser-based cinematic map animation and export tool. Built as a lightweight alternative to Google Earth Studio and After Effects for creating high-quality map sequences without the overhead of professional motion graphics suites.

[![erfgds.webp](https://i.postimg.cc/j5tDHKF6/erfgds.webp)](https://postimg.cc/rdZyc6cz)

## Features

- **Unified Planning Workflow**: Plan routes, boundaries, and 3D callouts using a standardized, search-first interface within a responsive "floating" toolbar.
- **3D Flight Arcs**: Automatically generate great-circle flight paths with parabolic altitude curves and synchronized vehicle animations.
- **Transformative Mobile UI**: State-driven mobile interface that switches between specialized 'Default', 'Add', and 'Layers' modes for optimal workspace on small screens.
- **Intelligent Search (Zustand-sync)**: Real-time geocoding with map-bias and interactive hover previews for high-precision placement.
- **Mutually Exclusive Tools**: Clean workspace logic ensuring only one creation tool is active at a time.
- **Offline MP4 Video Export**: Frame-perfect video rendering with high-quality encoding via WebCodecs and mp4-muxer.
- **Project Library**: Local project management and persistence using IndexedDB.
- **Zen Mode**: Immersive, UI-free environment for focusing on the map and final renders.

## Technical Stack

- **Frontend**: React 18 (Vite)
- **State Management**: Zustand
- **Map Engine**: Mapbox GL JS v3 (Globe and Mercator projections)
- **Geospatial**: Turf.js for line slicing and distance calculations
- **Styling**: Tailwind CSS 3 / shadcn/ui (Radix UI)
- **Video Encoding**: WebCodecs API + mp4-muxer
- **Persistence**: IndexedDB

## Development

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Architecture

The application uses a state-driven animation engine. A single Zustand store manages the project state, including the timeline playhead. A `requestAnimationFrame` loop drives the Mapbox camera and determines which segments of geospatial data to render based on the current time and item keyframes.

The video export process is non-real-time. It advances the playhead frame-by-frame, waits for Mapbox to reach an idle state (ensuring all tiles and models are loaded), captures the canvas, and encodes the frame.
