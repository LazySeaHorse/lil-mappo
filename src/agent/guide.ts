import '@/annotations/styles/index';
import { getAllStyles } from '@/annotations/registry';
import { LABEL_CATEGORIES, MAP_STYLES } from '@/config/mapbox';
import { EASING_NAMES } from './tools/shared';

/** Domain primer returned by get_guide. Kept as one plain-text document. */
export function buildGuide(): string {
  const styles = Object.entries(MAP_STYLES)
    .map(([key, def]) => `${key} (${def.label})`)
    .join(', ');
  const labels = LABEL_CATEGORIES.map((c) => c.id).join(', ');
  const callouts = getAllStyles()
    .map((s) => `- ${s.id}: ${s.name}, ${s.category}. ${s.description} Uses content: ${s.contentSlots.join(', ')}.${s.eyebrowFallback === 'coordinates' ? ' An empty eyebrow shows the point\'s coordinates.' : ''}`)
    .join('\n');

  return `li'l Mappo guide for AI agents

WHAT IT IS
li'l Mappo builds short cinematic map animations. A project is a timeline (default 30s) over a Mapbox map. Items appear and disappear at times you set; a camera track moves the view; the result is exported as video by the user (you cannot export).

CONVENTIONS
- Time is in seconds on the project timeline (0 to duration). startTime < endTime <= duration. New items start at the playhead and last 5s unless you pass times.
- Coordinates are [longitude, latitude] in degrees, longitude first. Anywhere a location is accepted you may pass a place name instead; it is geocoded (first result).
- Camera: zoom 0-22 (about 2 = continent, 10 = city, 15 = streets), pitch 0-85 degrees (0 = top-down), bearing in degrees clockwise from north (0 = north up).
- Every write tool call is one undo step. undo/redo revert the latest step (yours or the user's). Nothing is saved to the cloud; the user saves and exports.

ITEMS (get_project lists them, ids are stable)
- route: an animated line. mode "car" (Mapbox driving directions between two points), "flight" (great-circle arc, plane vehicle), "walk" (freehand through 2+ points, optionally curved). It draws itself over its time range; style has color, width, glow, dashPattern, animationType (draw | navigation | comet), trailFade. A vehicle marker can ride the line. exitAnimation: none | reverse | fade.
- boundary: a region outline (country, state, city) resolved from OpenStreetMap by name. animationStyle: fade | draw | trace. Style has strokeColor, fillColor, fillOpacity, strokeWidth, glow, and optionally maskOutside/maskColor/maskOpacity to dim everything outside the region.
- callout: an animated label or marker pinned to a map location (or the screen). styleId picks the look; content has title, subtitle, eyebrow, body, badge, metric. altitude lifts it above the ground point in pixels and offset [x, y] shifts it on screen. scale (1 = normal) sizes it; sizeMode "screen" (default) keeps that size in pixels at any zoom, "map" makes it grow and shrink with the camera zoom like a label printed on the map, sized as set at the map's current zoom. Each style plays its own entrance and exit by default (transition "auto", with enterDuration/exitDuration); set transition to fade, scale-up/scale-down or slide-up/slide-down to animate the whole callout instead.
- camera: one track (id "camera-track") holding keyframes {id, time, center, zoom, pitch, bearing, easing}. Between keyframes the camera eases from one to the next. With no keyframes the view stays wherever the map is.
- itemOrder is the track order in the timeline (first = top row). Camera track is included.

CALLOUT STYLES (styleId)
${callouts}

MAP LOOK (update_project_settings)
- mapStyle keys: ${styles}.
- lightPreset (Standard style): day | night | dusk | dawn. projection: globe | mercator. terrainEnabled, buildingsEnabled, show3dLandmarks/Trees/Facades, starIntensity 0-1, terrainExaggeration 1-3, fogColor.
- labelVisibility keys (true/false): ${labels}. Not every style supports every category.
- aspectRatio 16:9 | 21:9 | 4:3 | 1:1, exportResolution 480p-2160p, isVertical, fps 30 | 60. Free plans are capped at 720p, 30fps, 30s.

EASING NAMES
${EASING_NAMES.join(', ')}

TYPICAL WORKFLOW
1. get_project to see what exists (do not duplicate items).
2. search_place to find coordinates and extents.
3. add_route / add_boundary / add_callout with explicit startTime/endTime so items are staged across the timeline.
4. frame_items at the times you want each shot, or add_camera_keyframe for exact control. Add a keyframe just before an item starts so the camera arrives in time.
5. render_frames at a few times to look at the result; fix with update_item / update_camera_keyframe; undo if a change was wrong.

TIPS
- Prefer several short keyframes over one long move; use easeInOutCubic for smooth moves.
- A route reads best when the camera frames it before it starts drawing.
- Keep callout titles short. Time callouts to appear when the camera reaches them.
- Read the error object of a failed call; it says what to change.`;
}
