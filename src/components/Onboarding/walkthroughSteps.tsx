import React from 'react';
import type { Placement } from '@floating-ui/react';
import { Check, Circle } from 'lucide-react';
import type { MapGesture, WalkthroughStage } from './walkthroughState';

export type VisibleWalkthroughStage = Exclude<
  WalkthroughStage,
  'complete' | 'prepare-render' | 'route-editor' | 'boundary-editor' | 'callout-editor'
>;

export function GestureStatus({
  complete,
  children,
  subtext,
}: {
  complete: boolean;
  children: React.ReactNode;
  subtext?: React.ReactNode;
}) {
  const Icon = complete ? Check : Circle;

  return (
    <div
      className={`flex items-start gap-2.5 p-2 rounded-xl transition-all ${
        complete
          ? 'bg-primary/10 border border-primary/20'
          : 'bg-secondary/30 border border-border/30'
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full shrink-0 transition-colors ${
          complete ? 'bg-primary text-primary-foreground' : 'text-muted-foreground/60'
        }`}
      >
        <Icon
          size={11}
          className={complete ? 'text-primary-foreground stroke-[2.5]' : 'text-muted-foreground/60'}
          aria-hidden="true"
        />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={`text-xs leading-tight transition-colors ${
            complete ? 'text-foreground font-medium' : 'text-muted-foreground'
          }`}
        >
          {children}
        </div>
        {subtext && (
          <div className="mt-0.5 text-[11px] text-muted-foreground/75 leading-tight">{subtext}</div>
        )}
      </div>
    </div>
  );
}

export interface WalkthroughStepConfig {
  stage: VisibleWalkthroughStage;
  target: string;
  spotlightTarget?: string;
  title: string;
  placement: Placement;
  spotlightPadding?: number;
  hideOverlay?: boolean;
  buttons?: ('skip' | 'primary')[];
  nextLabel?: string;
  renderContent: (props: { isMobile: boolean; gestures: Record<MapGesture, boolean> }) => React.ReactNode;
}

export function getWalkthroughStages(isMobile: boolean, usesLayerMenu: boolean): VisibleWalkthroughStage[] {
  return [
    'map-controls',
    ...(isMobile ? ['open-add-menu' as const] : []),
    'first-keyframe',
    'move-playhead',
    'second-keyframe',
    'play-animation',
    'select-keyframe',
    'inspect-keyframe',
    'route',
    'boundary',
    'callout',
    ...(usesLayerMenu ? ['open-map-tools' as const] : []),
    'terrain-buildings',
    'change-map-style',
    'return-standard-style',
    'map-settings',
    'map-settings-tab',
    'map-settings-overview',
    'render',
  ];
}

export function getWalkthroughStepConfig(
  stage: VisibleWalkthroughStage,
  isMobile: boolean,
  isTablet: boolean,
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
        renderContent: () => 'Tap here to add camera views, routes, boundaries, and location pins.',
      };

    case 'first-keyframe':
      return {
        stage,
        target: '[data-walkthrough="camera-keyframe"]',
        title: 'Save your first view',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () => 'Click the camera button to save this position as your starting keyframe.',
      };

    case 'move-playhead':
      return {
        stage,
        target: '[data-walkthrough="timeline-panel"]',
        title: 'Move forward on the timeline',
        placement: 'top-start',
        spotlightPadding: 0,
        buttons: ['skip'],
        renderContent: () => 'Drag the blue playhead marker to the right to set the time for your next view.',
      };

    case 'second-keyframe':
      return {
        stage,
        target: '[data-walkthrough="camera-keyframe"]',
        title: 'Save your second view',
        placement: 'bottom',
        hideOverlay: true,
        buttons: ['skip'],
        renderContent: () => 'Move the map to a new location. Then click the camera button again to save your second keyframe.',
      };

    case 'play-animation':
      return {
        stage,
        target: '[data-walkthrough="timeline-play"]',
        title: 'Preview your animation',
        placement: 'top',
        buttons: ['skip', 'primary'],
        nextLabel: 'Next',
        renderContent: () => 'Click the Play button to watch the camera move smoothly between your two saved views.',
      };

    case 'select-keyframe':
      return {
        stage,
        target: '[data-walkthrough="timeline-keyframe"]',
        spotlightTarget: '[data-walkthrough="timeline-panel"]',
        title: 'Select a keyframe',
        placement: 'top',
        spotlightPadding: 0,
        buttons: ['skip'],
        renderContent: () => 'Click any keyframe marker on the timeline to open its settings panel.',
      };

    case 'inspect-keyframe':
      return {
        stage,
        target: '[data-walkthrough="inspector-panel"]',
        title: 'Adjust keyframe settings',
        placement: isMobile ? 'top' : 'left-start',
        buttons: ['skip', 'primary'],
        nextLabel: 'Continue',
        renderContent: () => 'Use the side panel to adjust time, camera angle, zoom level, and animation speed.',
      };

    case 'route':
      return {
        stage,
        target: '[data-walkthrough="add-route"]',
        title: 'Add a travel route',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () => 'Draw a driving, walking, or flight path on the map. You can also import GPX and KML files.',
      };

    case 'boundary':
      return {
        stage,
        target: '[data-walkthrough="add-boundary"]',
        title: 'Highlight a boundary',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () => 'Search and highlight any country, state, or custom region on the map.',
      };

    case 'callout':
      return {
        stage,
        target: '[data-walkthrough="add-callout"]',
        title: 'Add a location label',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () => 'Place an animated 3D pin and label to highlight an important location.',
      };

    case 'open-map-tools':
      return {
        stage,
        target: '[data-walkthrough="map-tools"]',
        title: 'Open Map Display',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () => 'Tap the Map Display button to view style and 3D landscape options.',
      };

    case 'terrain-buildings':
      return {
        stage,
        target: '[data-walkthrough="map-3d"]',
        title: 'Enable 3D terrain and buildings',
        placement: 'bottom',
        buttons: ['skip', 'primary'],
        nextLabel: 'Next',
        renderContent: () => 'Turn on Terrain for realistic hills and mountains. Turn on Buildings to show 3D city structures.',
      };

    case 'change-map-style':
      return {
        stage,
        target: isTablet ? '[data-walkthrough="map-tools"]' : '[data-walkthrough="map-style"]',
        title: 'Change the map style',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () =>
          isTablet
            ? 'Open Map Display. Select another style, such as Satellite or Dark.'
            : 'Open the style menu. Select another style, such as Satellite or Dark.',
      };

    case 'return-standard-style':
      return {
        stage,
        target: isTablet ? '[data-walkthrough="map-tools"]' : '[data-walkthrough="map-style"]',
        title: 'Reset to Standard style',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () =>
          isTablet
            ? 'Open Map Display again. Select the Standard style.'
            : 'Open the style menu again. Select the Standard style.',
      };

    case 'map-settings':
      return {
        stage,
        target: isTablet ? '[data-walkthrough="map-tools"]' : '[data-walkthrough="map-settings"]',
        title: 'Open Project Settings',
        placement: 'bottom',
        buttons: ['skip'],
        renderContent: () =>
          isTablet
            ? 'Open Map Display, then choose Full Map Settings.'
            : 'Click Settings to configure global project and map options.',
      };

    case 'map-settings-tab':
      return {
        stage,
        target: '[data-walkthrough="project-settings-map-tab"]',
        spotlightTarget: '[data-walkthrough="inspector-panel"]',
        title: 'Select the Map tab',
        placement: isMobile ? 'top' : 'left-start',
        buttons: ['skip'],
        renderContent: () => 'Click the Map tab to view environment and visual settings.',
      };

    case 'map-settings-overview':
      return {
        stage,
        target: '[data-walkthrough="inspector-panel"]',
        title: 'Customize the map environment',
        placement: isMobile ? 'top' : 'left-start',
        buttons: ['skip', 'primary'],
        nextLabel: 'Next',
        renderContent: () => 'Use this tab to adjust map projection, sun lighting, sky atmosphere, and place labels.',
      };

    case 'render':
      return {
        stage,
        target: '[data-walkthrough="render"]',
        title: 'Export your video',
        placement: 'bottom-end',
        buttons: ['skip'],
        renderContent: () => 'Click Export when you want to download your finished video. You do not need to export now.',
      };
  }
}
