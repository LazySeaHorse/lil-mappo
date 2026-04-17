# li'l Mappo (Map Animation Studio)

A technical, browser-based tool for creating cinematic map animations and exporting them as high-quality video. li'l Mappo provides a timeline-driven environment for choreographing map movements, importing route data, and annotating geographical areas with 3D callouts and boundaries.

[![redsfxfgdfbvcx.webp](https://i.postimg.cc/nhvCjTzX/redsfxfgdfbvcx.webp)](https://postimg.cc/bZwz4x1P)

## Core Features

### 1. Unified Route Planning & Import
- **GPX/KML Import**: Parse and animate existing route data.
- **Automated Routing**: Generate car, walking, or 3D flight paths using Mapbox Directions and Great Circle math.
- **Dynamic Line Animation**: Progressively draw routes over time with customizable width, color, glow effects, and tail fading.

### 2. Geographical Boundaries & Annotations
- **Boundary Lookup**: Search-based interface using Nominatim (OSM) to fetch and animate high-quality place polygons.
- **3D Callout Cards**: Position interactive 3D cards with images and synced titles. Support for "Pick on Map" mode and viewport-proximity bias.
- **Manual Picking & Move Mode**: High-precision crosshair mode for setting coordinates and repositioning items directly on the terrain.
- **Unified Drafting**: Specialized tools for routes and boundaries that allow searching, styling, and previewing before adding to the timeline.

### 3. Cinematic Camera Choreography
- **Keyframe-based Timeline**: Full control over camera center, zoom, pitch, bearing, and altitude.
- **Interpolation & Easing**: Custom easing functions (Linear, Quad, Cubic, Sine) for smooth transitions.
- **Follow Route**: Camera can be tethered to a route geometry for automated movement along a path.
- **Orbit Helper**: Automatically generate keyframes for 360-degree orbital shots.

### 4. Advanced Map Views
- **3D Terrain & Buildings**: Native support for Mapbox Terrain RGB and 3D buildings (fill-extrusion).
- **Dynamic Label Control**: A runtime capability system that detects available label groups (Places, Roads, POIs, etc.) for any style and provides granular toggles.
- **Mapbox Standard Support**: Full integration with the Mapbox Standard style, including Config API support for lighting presets and 3D feature toggles.
- **Projections**: Seamless switching between Globe and Mercator projections.
- **Zen Mode**: Focus-oriented, UI-free environment with floating controls.

### 5. High-Quality Video Export
- **Frame-Perfect Encoding**: Non-real-time export process using the WebCodecs API and `mp4-muxer`.
- **Customizable Output**: Export at various resolutions (up to 4K) and frame rates (30/60 FPS).
- **Composite Rendering**: Orchestrated capture of Mapbox canvas and DOM overlays (markers/callouts).

## Tech Stack

- **Framework**: React 18+ (Vite)
- **State Management**: Zustand (single-store architecture)
- **Map Engine**: Mapbox GL JS v3 (via `react-map-gl/mapbox`)
- **Geospatial Processing**: Turf.js (`@turf/along`, `@turf/length`, `@turf/distance`, `@turf/great-circle`)
- **Animations**: Custom `requestAnimationFrame` loop with interpolated state and easing functions.
- **Video Export**: WebCodecs API, `mp4-muxer`, pure Canvas 2D (for callout rendering).
- **UI Components**: Tier 1 & 2 standardized component library built on shadcn/ui v0.9+ (Radix UI) and Tailwind CSS.
- **Icons**: Lucide React.
- **Persistence**: IndexedDB (local project library).
- **Testing**: Vitest (Unit/Integration) and Playwright (E2E).
- **External APIs**: Mapbox Directions (v5), Mapbox Search Box API (v1), Nominatim (OSM).

## Architecture

The application operates as a **state-driven animation engine**. A central Zustand store manages all timeline elements (Routes, Boundaries, Callouts, Camera Keyframes) and the global `playheadTime`.