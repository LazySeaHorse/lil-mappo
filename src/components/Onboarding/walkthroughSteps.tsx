import React from 'react';
import type { Placement } from '@floating-ui/react';
import type { MapGesture, WalkthroughPlan, WalkthroughState, WalkthroughStage } from './walkthroughState';
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
  /** A second way forward beside the primary button, e.g. "Finish" next to "Keep going". */
  secondaryLabel?: string;
  renderContent: (progress: WalkthroughProgress) => React.ReactNode;
}

const EXTRAS_STAGES: VisibleWalkthroughStage[] = [
  'camera-view-time-1',
  'camera-view-move-1',
  'camera-view-first',
  'camera-view-time-2',
  'camera-view-move-2',
  'camera-view-second',
  'camera-view-rewind',
  'camera-view-play',
  'boundary',
  'boundary-insert',
  'callout',
  'callout-insert',
  'project-settings',
  'project-settings-panel',
];

export function getWalkthroughStages(isMobile: boolean, plan: WalkthroughPlan = 'trip'): VisibleWalkthroughStage[] {
  if (plan === 'extras') return [...EXTRAS_STAGES, 'render'];
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
    ...(plan === 'trip+extras' ? EXTRAS_STAGES : []),
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
        title: 'Your trip video is ready',
        placement: 'bottom',
        buttons: ['skip', 'primary'],
        nextLabel: 'Keep going',
        secondaryLabel: 'Go to Export',
        renderContent: () =>
          'You can export now. Or keep going for 2 more minutes: add camera views, a border and a callout.',
      };

    case 'camera-view-time-1':
      return {
        stage,
        target: '[data-walkthrough="timeline-panel"]',
        title: 'Pick a time for your first view',
        placement: 'top-start',
        spotlightPadding: 0,
        hideOverlay: true,
        buttons: ['skip'],
        renderContent: () =>
          'Drag the playhead to a time after the route ends. A camera view cannot go where Follow route already steers the camera.',
      };

    case 'camera-view-move-1':
      return {
        stage,
        target: '[data-walkthrough="map-coachmark-anchor"]',
        title: 'Move the map',
        placement: 'right-start',
        hideOverlay: true,
        buttons: ['skip'],
        renderContent: () =>
          `${isMobile ? 'Drag' : 'Left-click and drag'} the map to where the video should look at this time. The camera button stays locked until you do.`,
      };

    case 'camera-view-first':
      return {
        stage,
        target: isMobile ? '[data-walkthrough="add-menu"]' : '[data-walkthrough="camera-keyframe"]',
        title: 'Save your first camera view',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () =>
          `${isMobile ? 'Open the Add menu, then press' : 'Press'} the camera button to save what the map shows now. The camera flies from view to view.`,
      };

    case 'camera-view-time-2':
      return {
        stage,
        target: '[data-walkthrough="timeline-panel"]',
        title: 'Move the playhead forward',
        placement: 'top-start',
        spotlightPadding: 0,
        hideOverlay: true,
        buttons: ['skip'],
        renderContent: () => 'Drag the playhead to the right of your first view. The camera flies between the two in that time.',
      };

    case 'camera-view-move-2':
      return {
        stage,
        target: '[data-walkthrough="map-coachmark-anchor"]',
        title: 'Move the map somewhere new',
        placement: 'right-start',
        hideOverlay: true,
        buttons: ['skip'],
        renderContent: () => 'Move the map to a different place, zoom or angle. The camera button stays locked until you do.',
      };

    case 'camera-view-second':
      return {
        stage,
        target: isMobile ? '[data-walkthrough="add-menu"]' : '[data-walkthrough="camera-keyframe"]',
        title: 'Save a second camera view',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () => `${isMobile ? 'Open the Add menu, then press' : 'Press'} the camera button again.`,
      };

    case 'camera-view-rewind':
      return {
        stage,
        target: '[data-walkthrough="timeline-start"]',
        title: 'Go back to the start',
        placement: 'top',
        buttons: ['skip'],
        renderContent: () => 'Press Jump to Start, so the video plays from the first view.',
      };

    case 'camera-view-play':
      return {
        stage,
        target: '[data-walkthrough="timeline-play"]',
        title: 'Watch the camera fly',
        placement: 'top',
        buttons: ['skip', 'primary'],
        nextLabel: 'Next',
        renderContent: () => 'Press Play. The camera flies smoothly from your first view to your second.',
      };

    case 'boundary':
      return {
        stage,
        target: isMobile ? '[data-walkthrough="add-menu"]' : '[data-walkthrough="add-boundary"]',
        title: 'Highlight a border',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () =>
          `${isMobile ? 'Open the Add menu and choose Add Boundary.' : 'Click Add Boundary.'} You can outline a country, state or city.`,
      };

    case 'boundary-insert':
      return {
        stage,
        target: '[data-walkthrough="boundary-action"]',
        title: 'Pick a place and insert it',
        placement: isMobile ? 'top' : 'right',
        hideOverlay: true,
        compact: true,
        buttons: ['skip'],
        renderContent: () => 'Search for a place, pick a result, then press Insert boundary.',
      };

    case 'callout':
      return {
        stage,
        target: isMobile ? '[data-walkthrough="add-menu"]' : '[data-walkthrough="add-callout"]',
        title: 'Add a callout',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () =>
          `${isMobile ? 'Open the Add menu and choose Add Callout.' : 'Click Add Callout.'} A callout is a pin with a label on the map.`,
      };

    case 'callout-insert':
      return {
        stage,
        target: '[data-walkthrough="callout-action"]',
        title: 'Pick a place and create it',
        placement: isMobile ? 'top' : 'right',
        hideOverlay: true,
        compact: true,
        buttons: ['skip'],
        renderContent: () => 'Search for a place, or click the crosshair and then the map. Then press Create callout.',
      };

    case 'project-settings':
      return {
        stage,
        target: isMobile ? '[data-walkthrough="map-tools"]' : '[data-walkthrough="map-settings"]',
        title: 'Open Map Settings',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () =>
          isMobile
            ? 'Open Map Display, then choose Full Map Settings.'
            : 'Click Map Settings to set up the video itself.',
      };

    case 'project-settings-panel':
      return {
        stage,
        target: '[data-walkthrough="inspector-panel"]',
        title: 'Adjust your video settings',
        placement: isMobile ? 'top' : 'left-start',
        buttons: ['skip', 'primary'],
        nextLabel: 'Next',
        renderContent: () =>
          'Set the video length, aspect ratio, frame rate and resolution here. Below them are the map style, lighting and terrain.',
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
