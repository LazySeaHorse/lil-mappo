import React from 'react';
import type { Placement } from '@floating-ui/react';
import type { MapGesture, WalkthroughState, WalkthroughStage } from './walkthroughState';
import { GestureStatus } from './GestureStatus';
import { ROUTE_TERMS } from '@/lib/terms';

export type VisibleWalkthroughStage = Exclude<WalkthroughStage, 'complete'>;

/** What a step can show about the user's progress. */
export interface WalkthroughProgress {
  isMobile: boolean;
  gestures: Record<MapGesture, boolean>;
  routeEndpoints: WalkthroughState['routeEndpoints'];
}

export interface WalkthroughStepConfig {
  stage: VisibleWalkthroughStage;
  target: string;
  spotlightTarget?: string;
  title: string;
  placement: Placement;
  spotlightPadding?: number;
  hideOverlay?: boolean;
  /** A narrower card, for steps beside a panel that needs the room. */
  compact?: boolean;
  /** Scrolls the target into view, for targets inside a panel that scrolls. */
  scrollIntoView?: boolean;
  buttons?: ('skip' | 'primary')[];
  nextLabel?: string;
  renderContent: (progress: WalkthroughProgress) => React.ReactNode;
}

export function getWalkthroughStages(isMobile: boolean): VisibleWalkthroughStage[] {
  return [
    'map-controls',
    ...(isMobile ? ['open-add-menu' as const] : []),
    'route',
    'route-places',
    'route-preview',
    'route-insert',
    'follow-route',
    'play-animation',
    'more-tools',
    'render',
  ];
}

export function getWalkthroughStepConfig(
  stage: VisibleWalkthroughStage,
  isMobile: boolean,
): WalkthroughStepConfig {
  const mapControlCopy = isMobile
    ? {
        pan: 'Drag with one finger to pan',
        orbit: 'Drag with two fingers to tilt and rotate',
        zoom: 'Pinch with two fingers to zoom',
      }
    : {
        pan: 'Left-click and drag to move the map',
        orbit: 'Right-click and drag to tilt and rotate',
        zoom: 'Scroll the mouse wheel to zoom',
      };

  // The Plan Route panel opens under the toolbar, so desktop steps sit beside it.
  const panelPlacement: Placement = isMobile ? 'bottom' : 'right-start';

  switch (stage) {
    case 'map-controls':
      return {
        stage,
        target: '[data-walkthrough="map-coachmark-anchor"]',
        spotlightTarget: '[data-walkthrough="map-viewport"]',
        title: 'Learn the map controls',
        placement: 'right-start',
        spotlightPadding: 0,
        buttons: ['skip'],
        renderContent: ({ gestures }) => (
          <div className="space-y-2 text-left mt-1">
            <GestureStatus complete={gestures.pan}>{mapControlCopy.pan}</GestureStatus>
            <GestureStatus
              complete={gestures.orbit}
              subtext={isMobile ? undefined : 'You can also hold Ctrl and left-drag.'}
            >
              {mapControlCopy.orbit}
            </GestureStatus>
            <GestureStatus complete={gestures.zoom}>{mapControlCopy.zoom}</GestureStatus>
          </div>
        ),
      };

    case 'open-add-menu':
      return {
        stage,
        target: '[data-walkthrough="add-menu"]',
        title: 'Open the Add menu',
        placement: 'bottom-start',
        buttons: ['skip'],
        renderContent: () => 'Tap here to add routes, boundaries, labels, and camera views.',
      };

    case 'route':
      return {
        stage,
        target: '[data-walkthrough="add-route"]',
        title: 'Open Plan Route',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () => 'Click Plan Route. You will pick a start place and an end place.',
      };

    case 'route-places':
      return {
        stage,
        target: '[data-walkthrough="route-places"]',
        title: 'Pick a start and an end place',
        placement: panelPlacement,
        // The search results open over the map, so the map stays clear.
        hideOverlay: true,
        compact: true,
        buttons: ['skip'],
        renderContent: ({ routeEndpoints }) => (
          <div className="space-y-2 text-left mt-1">
            <GestureStatus
              complete={routeEndpoints.start}
              subtext="You can also click the crosshair and then click the map."
            >
              Start: type a place, press Enter, then pick a result
            </GestureStatus>
            <GestureStatus complete={routeEndpoints.end}>
              End: do the same for the end place
            </GestureStatus>
          </div>
        ),
      };

    case 'route-preview':
      return {
        stage,
        target: '[data-walkthrough="route-action"]',
        title: 'Preview the path',
        placement: isMobile ? 'top' : 'right',
        compact: true,
        buttons: ['skip'],
        renderContent: () => 'Press Preview path. The map shows the route between your two places.',
      };

    case 'route-insert':
      return {
        stage,
        target: '[data-walkthrough="route-action"]',
        title: 'Add the route to your video',
        placement: isMobile ? 'top' : 'right',
        compact: true,
        buttons: ['skip'],
        renderContent: () =>
          'Press Insert route. The route starts at the playhead on the timeline, and the map moves to show it.',
      };

    case 'follow-route':
      return {
        stage,
        target: '[data-walkthrough="follow-route"]',
        title: 'Make the camera follow the route',
        placement: isMobile ? 'top' : 'left-start',
        scrollIntoView: true,
        buttons: ['skip'],
        renderContent: () => `Turn on ${ROUTE_TERMS.followCamera}. When you play the video, the camera moves along the route.`,
      };

    case 'play-animation':
      return {
        stage,
        target: '[data-walkthrough="timeline-play"]',
        title: 'Play your trip',
        placement: 'top',
        buttons: ['skip', 'primary'],
        nextLabel: 'Next',
        renderContent: () => 'Press Play. The route draws itself, and the camera follows it.',
      };

    case 'more-tools':
      return {
        stage,
        target: isMobile ? '[data-walkthrough="add-menu"]' : '[data-walkthrough="camera-keyframe"]',
        title: 'More things you can add',
        placement: 'bottom',
        buttons: ['skip', 'primary'],
        nextLabel: 'Next',
        renderContent: () =>
          'Camera views, boundaries, callouts, and map styles are in the toolbar. Try them when you are ready.',
      };

    case 'render':
      return {
        stage,
        target: '[data-walkthrough="render"]',
        title: 'Export your video',
        placement: 'bottom-end',
        buttons: ['skip'],
        renderContent: () => 'Press Export to save your trip as a video file.',
      };
  }
}
