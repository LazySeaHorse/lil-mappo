# li'l Mappo

**li'l Mappo** is a cinematic map animation and export tool designed for creators, storytellers, and geospatial enthusiasts. Transform your geographic data into stunning, high-quality motion graphics with ease.

## Features

- **Interactive Map Engine**: Powered by Mapbox GL JS v3 for smooth, high-performance map rendering.
- **Route Animations**: Import GPX/KML files and watch your routes draw themselves in 3D space.
- **Place Boundaries**: Automatically lookup and highlight administrative boundaries using Nominatim.
- **3D Callouts**: Add context with floating, anchored 3D labels and cards.
- **Camera Choreography**: Fine-tune your cinematic shots with a keyframe-based camera system.
- **High-Quality Export**: Export your masterpiece as a professional-grade MP4 video directly from your browser using the WebCodecs API.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [bun](https://bun.sh/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/LazySeaHorse/lil-mappo.git
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:8080`.

## Tech Stack

- **Framework**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Map Engine**: [Mapbox GL JS v3](https://www.mapbox.com/mapbox-gl-js)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)
- **Geospatial Logic**: [Turf.js](https://turfjs.org/)
- **Video Processing**: [mp4-muxer](https://github.com/v8/mp4-muxer)
