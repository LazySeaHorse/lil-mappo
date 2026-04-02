# Map Animation Studio (li'l Mappo)

A browser-based cinematic map animation and export tool. Built as a lightweight alternative to Google Earth Studio and After Effects for creating high-quality map sequences without the overhead of professional motion graphics suites.

[![erfgds.webp](https://i.postimg.cc/j5tDHKF6/erfgds.webp)](https://postimg.cc/rdZyc6cz)

## Features

- **Route Animation**: Import and animate GPX/KML route data with customizable drawing styles.
- **Boundary Lookup**: Search and highlight place boundaries using Nominatim (OSM) data.
- **3D Callouts**: Add 3D-anchored annotation cards with support for custom Google Fonts.
- **Choreographed Camera**: Keyframe-based timeline for controlling Mapbox camera movements (center, pitch, bearing, zoom).
- **Interpolation Engine**: Smooth camera transitions using custom easing functions and route-following logic.
- **High-Quality Export**: Off-line MP4 video export at custom resolutions and framerates using WebCodecs and mp4-muxer.
- **Project Library**: Local project management and persistence via IndexedDB.
- **Zen Mode**: UI-free environment for distraction-free editing and optimized video rendering.

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
