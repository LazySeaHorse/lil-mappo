import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ACTIONS, Joyride, ORIGIN, STATUS, type EventData, type Step } from 'react-joyride';
import { Check, Circle, Compass } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CAMERA_TRACK_ID, useProjectStore } from '@/store/useProjectStore';
import type { CameraItem } from '@/store/types';
import { toast } from 'sonner';
import {
  createWalkthroughState,
  walkthroughReducer,
  type MapGesture,
  type WalkthroughAddTool,
  type WalkthroughEvent,
  type WalkthroughStage,
} from './walkthroughState';

const WALKTHROUGH_STORAGE_KEY = 'lil-mappo:quick-walkthrough:v1';

type StoredWalkthroughStatus = 'started' | 'dismissed' | 'completed';

function readStoredStatus(): StoredWalkthroughStatus | null {
  try {
    return localStorage.getItem(WALKTHROUGH_STORAGE_KEY) as StoredWalkthroughStatus | null;
  } catch {
    return null;
  }
}

function storeStatus(status: StoredWalkthroughStatus) {
  try {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, status);
  } catch {
    // The walkthrough still works when storage is unavailable.
  }
}

export interface QuickWalkthroughHandle {
  start: () => void;
  recordMapGesture: (gesture: MapGesture) => void;
  recordAddToolOpenChange: (tool: WalkthroughAddTool, open: boolean) => boolean;
  recordMapStyleOpenChange: (open: boolean) => void;
  recordMapToolsOpenChange: (open: boolean) => void;
  recordExportOpened: () => void;
}

interface QuickWalkthroughProps {
  isMapReady: boolean;
  isMobile: boolean;
  isTablet: boolean;
}

type VisibleWalkthroughStage = Exclude<
  WalkthroughStage,
  'complete' | 'watch-animation' | 'route-editor' | 'boundary-editor' | 'callout-editor'
>;

function GestureStatus({
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
    <div className="flex items-start gap-2 text-sm">
      <Icon
        size={15}
        className={`mt-0.5 shrink-0 ${complete ? 'text-primary' : 'text-muted-foreground/60'}`}
        aria-hidden="true"
      />
      <div>
        <div className={complete ? 'text-foreground' : 'text-muted-foreground'}>{children}</div>
        {subtext && (
          <div className="mt-0.5 text-xs text-muted-foreground/75">{subtext}</div>
        )}
      </div>
    </div>
  );
}

const QuickWalkthrough = forwardRef<QuickWalkthroughHandle, QuickWalkthroughProps>(
  function QuickWalkthrough({ isMapReady, isMobile, isTablet }, ref) {
    const [showInvitation, setShowInvitation] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [exploreSecondsRemaining, setExploreSecondsRemaining] = useState(5);
    const [isMapStyleOpen, setIsMapStyleOpen] = useState(false);
    const [isMapToolsOpen, setIsMapToolsOpen] = useState(false);
    const usesLayerMenu = isMobile || isTablet;
    const [walkthrough, setWalkthrough] = useState(() =>
      createWalkthroughState(isMobile, 0, usesLayerMenu),
    );
    const cameraKeyframes = useProjectStore((state) => {
      const camera = state.items[CAMERA_TRACK_ID] as CameraItem | undefined;
      return camera?.keyframes ?? [];
    });
    const cameraKeyframeCount = cameraKeyframes.length;
    const lastCameraKeyframeTime = cameraKeyframes.at(-1)?.time ?? 0;
    const playheadTime = useProjectStore((state) => state.playheadTime);
    const isPlaying = useProjectStore((state) => state.isPlaying);
    const selectedKeyframeId = useProjectStore((state) => state.selectedKeyframeId);
    const mapStyle = useProjectStore((state) => state.mapStyle);
    const projectSettingsTab = useProjectStore((state) => state.projectSettingsTab);
    const clearedSelectionForPrompt = useRef(false);

    const send = useCallback((event: WalkthroughEvent) => {
      setWalkthrough((current) => walkthroughReducer(current, event));
    }, []);

    const start = useCallback(() => {
      setShowInvitation(false);
      setWalkthrough(createWalkthroughState(isMobile, cameraKeyframeCount, usesLayerMenu));
      setIsRunning(true);
      storeStatus('started');
    }, [cameraKeyframeCount, isMobile, usesLayerMenu]);

    const recordMapGesture = useCallback((gesture: MapGesture) => {
      if (isRunning) send({ type: 'map-gesture', gesture });
    }, [isRunning, send]);

    const recordAddToolOpenChange = useCallback((tool: WalkthroughAddTool, open: boolean) => {
      if (!isRunning) return false;
      send({ type: open ? 'add-tool-opened' : 'add-tool-closed', tool });
      return true;
    }, [isRunning, send]);

    const recordMapStyleOpenChange = useCallback((open: boolean) => {
      setIsMapStyleOpen(open);
    }, []);

    const recordMapToolsOpenChange = useCallback((open: boolean) => {
      setIsMapToolsOpen(open);
      if (isRunning && open) send({ type: 'map-tools-opened' });
    }, [isRunning, send]);

    const recordExportOpened = useCallback(() => {
      if (isRunning) send({ type: 'export-opened' });
    }, [isRunning, send]);

    useImperativeHandle(
      ref,
      () => ({
        start,
        recordMapGesture,
        recordAddToolOpenChange,
        recordMapStyleOpenChange,
        recordMapToolsOpenChange,
        recordExportOpened,
      }),
      [
        recordAddToolOpenChange,
        recordExportOpened,
        recordMapGesture,
        recordMapStyleOpenChange,
        recordMapToolsOpenChange,
        start,
      ],
    );

    useEffect(() => {
      if (!isMapReady || readStoredStatus()) return;

      const invitationDelay = window.setTimeout(() => setShowInvitation(true), 600);
      return () => window.clearTimeout(invitationDelay);
    }, [isMapReady]);

    useEffect(() => {
      if (!isRunning) return;
      send({ type: 'keyframe-count-changed', count: cameraKeyframeCount, playheadTime });
    }, [cameraKeyframeCount, isRunning, playheadTime, send]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'move-again') return;

      setExploreSecondsRemaining(5);
      const startedAt = Date.now();
      const countdown = window.setInterval(() => {
        const elapsedSeconds = (Date.now() - startedAt) / 1000;
        setExploreSecondsRemaining(Math.max(0, Math.ceil(5 - elapsedSeconds)));
      }, 200);
      const finishExploring = window.setTimeout(() => {
        send({ type: 'exploration-time-elapsed' });
      }, 5000);

      return () => {
        window.clearInterval(countdown);
        window.clearTimeout(finishExploring);
      };
    }, [isRunning, send, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'move-playhead') return;
      if (isMobile) useProjectStore.getState().setIsInspectorOpen(false);
      send({ type: 'playhead-time-changed', time: playheadTime });
    }, [isMobile, isRunning, playheadTime, send, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'play-animation') return;

      const store = useProjectStore.getState();
      store.setIsPlaying(false);
      store.setPlayheadTime(0);
      store.selectKeyframe(null);
      store.setIsInspectorOpen(false);
    }, [isRunning, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning) return;

      if (walkthrough.stage === 'play-animation' && isPlaying) {
        send({ type: 'playback-started' });
        return;
      }

      if (walkthrough.stage !== 'watch-animation') return;

      if (isPlaying && playheadTime >= lastCameraKeyframeTime - 0.03) {
        useProjectStore.getState().setIsPlaying(false);
        send({ type: 'playback-finished' });
      } else if (!isPlaying) {
        send({ type: 'playback-paused' });
      }
    }, [isPlaying, isRunning, lastCameraKeyframeTime, playheadTime, send, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'select-keyframe') {
        clearedSelectionForPrompt.current = false;
        return;
      }

      if (!clearedSelectionForPrompt.current) {
        clearedSelectionForPrompt.current = true;
        const store = useProjectStore.getState();
        store.selectKeyframe(null);
        store.setIsInspectorOpen(false);
        return;
      }

      if (selectedKeyframeId) send({ type: 'keyframe-selected' });
    }, [isRunning, selectedKeyframeId, send, walkthrough.stage]);

    useEffect(() => {
      if (
        !isRunning ||
        (walkthrough.stage !== 'change-map-style' &&
          walkthrough.stage !== 'return-standard-style')
      ) return;

      send({ type: 'map-style-changed', style: mapStyle });
    }, [isRunning, mapStyle, send, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'map-settings-tab') return;
      send({ type: 'project-settings-tab-changed', tab: projectSettingsTab });
    }, [isRunning, projectSettingsTab, send, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'render') return;
      useProjectStore.getState().setIsInspectorOpen(false);
    }, [isRunning, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning) return;

      const handleClick = (event: MouseEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        if (target.closest('[data-walkthrough="add-menu"]')) send({ type: 'add-menu-opened' });
        if (target.closest('[data-walkthrough="map-tools"]')) send({ type: 'map-tools-opened' });
        if (target.closest('[data-walkthrough="map-settings"]')) send({ type: 'map-settings-opened' });
      };

      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }, [isRunning, send]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'complete') return;

      setIsRunning(false);
      storeStatus('completed');
      toast.success('Walkthrough complete. Your map is ready to build on.');
    }, [isRunning, walkthrough.stage]);

    const stages = useMemo<VisibleWalkthroughStage[]>(() => [
      'map-controls',
      ...(isMobile ? ['open-add-menu' as const] : []),
      'first-keyframe',
      'move-again',
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
      'render',
    ], [isMobile, usesLayerMenu]);

    const steps = useMemo<Step[]>(() => {
      const mapControlCopy = isMobile
        ? {
            pan: 'Drag with one finger to move',
            orbit: 'Drag with two fingers to look around',
            zoom: 'Pinch to zoom in and out',
          }
        : {
            pan: 'Drag with the main mouse button to move',
            orbit: 'Drag with the secondary mouse button to look around',
            zoom: 'Scroll to zoom in and out',
          };

      const byStage: Record<VisibleWalkthroughStage, Step> = {
        'map-controls': {
          target: '[data-walkthrough="map-coachmark-anchor"]',
          spotlightTarget: '[data-walkthrough="map-viewport"]',
          title: 'Get comfortable with the map',
          placement: 'right-start',
          spotlightPadding: 0,
          floatingOptions: { hideArrow: true, flipOptions: false },
          content: (
            <div className="space-y-2.5 text-left">
              <GestureStatus complete={walkthrough.gestures.pan}>{mapControlCopy.pan}</GestureStatus>
              <GestureStatus
                complete={walkthrough.gestures.orbit}
                subtext={isMobile ? undefined : 'Or hold Ctrl and drag with the primary mouse button.'}
              >
                {mapControlCopy.orbit}
              </GestureStatus>
              <GestureStatus complete={walkthrough.gestures.zoom}>{mapControlCopy.zoom}</GestureStatus>
            </div>
          ),
        },
        'open-add-menu': {
          target: '[data-walkthrough="add-menu"]',
          title: 'Open the add tools',
          content: 'Tap here to find camera keyframes, routes, boundaries, and callouts.',
          placement: 'bottom-start',
        },
        'first-keyframe': {
          target: '[data-walkthrough="camera-keyframe"]',
          title: 'Save this view',
          content: 'Add a camera keyframe to remember the current position and angle.',
          placement: 'bottom',
        },
        'move-again': {
          target: '[data-walkthrough="map-coachmark-anchor"]',
          spotlightTarget: '[data-walkthrough="map-viewport"]',
          title: 'Choose the next view',
          content: `Move around and choose a different camera angle. Continuing in ${exploreSecondsRemaining} seconds.`,
          placement: 'right-start',
          spotlightPadding: 0,
          floatingOptions: { hideArrow: true, flipOptions: false },
        },
        'move-playhead': {
          target: '[data-walkthrough="timeline-panel"]',
          title: 'Move forward in time',
          content: 'Drag the playhead on the timeline to where you want the second view to appear.',
          placement: 'top-start',
          spotlightPadding: 0,
          skipScroll: true,
        },
        'second-keyframe': {
          target: '[data-walkthrough="camera-keyframe"]',
          title: 'Save the new view',
          content: 'Add another keyframe. The camera animates between your saved views.',
          placement: 'bottom',
        },
        'play-animation': {
          target: '[data-walkthrough="timeline-play"]',
          title: 'Play your camera move',
          content: 'Press Play to preview the animation between your two saved views.',
          placement: 'top',
        },
        'select-keyframe': {
          target: '[data-walkthrough="timeline-keyframe"]',
          spotlightTarget: '[data-walkthrough="timeline-panel"]',
          title: 'Inspect a keyframe',
          content: 'Click a keyframe in the timeline to open its settings.',
          placement: 'top',
          spotlightPadding: 0,
          skipScroll: true,
        },
        'inspect-keyframe': {
          target: '[data-walkthrough="inspector-panel"]',
          title: 'Fine-tune this keyframe',
          content: 'Use the inspector to adjust its timing, position, zoom, angle, and easing.',
          placement: isMobile ? 'top' : 'left-start',
          buttons: ['skip', 'primary'],
          locale: { next: 'Continue' },
        },
        route: {
          target: '[data-walkthrough="add-route"]',
          title: 'Add a route',
          content: 'Plan a drive, walk, or flight, or import a GPX or KML file.',
          placement: 'bottom',
        },
        boundary: {
          target: '[data-walkthrough="add-boundary"]',
          title: 'Highlight a place',
          content: 'Add a country, region, or custom boundary to the map.',
          placement: 'bottom',
        },
        callout: {
          target: '[data-walkthrough="add-callout"]',
          title: 'Add a callout',
          content: 'Place a label on the map to explain why a location matters.',
          placement: 'bottom',
        },
        'open-map-tools': {
          target: '[data-walkthrough="map-tools"]',
          title: 'Open the map controls',
          content: 'Open Map Display to see the map style and 3D controls.',
          placement: 'bottom',
        },
        'terrain-buildings': {
          target: '[data-walkthrough="map-3d"]',
          title: 'Explore the map in 3D',
          content: 'Terrain adds elevation and Buildings adds 3D structures. You can enable either whenever it suits the scene.',
          placement: 'bottom',
          buttons: ['skip', 'primary'],
          locale: { next: 'Next' },
        },
        'change-map-style': {
          target: isTablet ? '[data-walkthrough="map-tools"]' : '[data-walkthrough="map-style"]',
          title: 'Try another map style',
          content: isTablet
            ? 'Open Map Display and choose a style other than Standard.'
            : 'Open the style menu and choose a style other than Standard.',
          placement: 'bottom',
        },
        'return-standard-style': {
          target: isTablet ? '[data-walkthrough="map-tools"]' : '[data-walkthrough="map-style"]',
          title: 'Return to Standard',
          content: isTablet
            ? 'Use Map Display to switch the style back to Standard.'
            : 'Switch the map style back to Standard.',
          placement: 'bottom',
        },
        'map-settings': {
          target: isTablet ? '[data-walkthrough="map-tools"]' : '[data-walkthrough="map-settings"]',
          title: 'Open Map Settings',
          content: isTablet
            ? 'Open Map Display, then choose Full Map Settings.'
            : 'Open Map Settings for the project-wide display controls.',
          placement: 'bottom',
        },
        'map-settings-tab': {
          target: '[data-walkthrough="project-settings-map-tab"]',
          spotlightTarget: '[data-walkthrough="inspector-panel"]',
          title: 'Open the Map tab',
          content: 'This is where you can adjust projection, lighting, terrain, atmosphere, labels, and 3D details.',
          placement: isMobile ? 'top' : 'left-start',
        },
        render: {
          target: '[data-walkthrough="render"]',
          title: 'Ready to render',
          content: 'Open Export when you are ready to render the finished animation. You do not need to start a render now.',
          placement: 'bottom-end',
        },
      };

      return stages.map((stage) => ({
        ...byStage[stage],
        buttons: byStage[stage].buttons ?? ['skip'],
        skipBeacon: true,
        blockTargetInteraction: false,
        disableFocusTrap: true,
        overlayClickAction: false,
        targetWaitTimeout: 1500,
      }));
    }, [exploreSecondsRemaining, isMobile, isTablet, stages, walkthrough.gestures]);

    const stepIndex = Math.max(0, stages.indexOf(walkthrough.stage));
    const isUsingAddTool = walkthrough.stage.endsWith('-editor');
    const isWatchingAnimation = walkthrough.stage === 'watch-animation';
    const isUsingStylePopup = isMapStyleOpen || (
      isTablet &&
      isMapToolsOpen &&
      (walkthrough.stage === 'change-map-style' ||
        walkthrough.stage === 'return-standard-style' ||
        walkthrough.stage === 'map-settings')
    );

    const handleTourEvent = useCallback((event: EventData) => {
      if (event.status === STATUS.SKIPPED) {
        setIsRunning(false);
        storeStatus('dismissed');
        return;
      }

      if (
        (walkthrough.stage === 'inspect-keyframe' || walkthrough.stage === 'terrain-buildings') &&
        event.action === ACTIONS.NEXT &&
        event.origin === ORIGIN.BUTTON_PRIMARY
      ) {
        if (walkthrough.stage === 'inspect-keyframe') {
          send({ type: 'inspector-acknowledged' });
        } else {
          send({ type: 'terrain-intro-acknowledged', currentStyle: mapStyle });
        }
      }
    }, [mapStyle, send, walkthrough.stage]);

    return (
      <>
        <AlertDialog open={showInvitation} onOpenChange={setShowInvitation}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Compass size={20} aria-hidden="true" />
              </div>
              <AlertDialogTitle>Want a quick walkthrough?</AlertDialogTitle>
              <AlertDialogDescription>
                Learn the map controls and create your first camera move. It takes about 90 seconds.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => storeStatus('dismissed')}>No thanks</AlertDialogCancel>
              <AlertDialogAction onClick={start}>Show me around</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Joyride
          run={isRunning && !isUsingAddTool && !isWatchingAnimation && !isUsingStylePopup}
          stepIndex={stepIndex}
          steps={steps}
          continuous
          onEvent={handleTourEvent}
          options={{
            backgroundColor: 'hsl(var(--background))',
            textColor: 'hsl(var(--foreground))',
            primaryColor: 'hsl(var(--primary))',
            arrowColor: 'hsl(var(--background))',
            overlayColor: 'rgba(0, 0, 0, 0.58)',
            spotlightPadding: 6,
            spotlightRadius: 10,
            zIndex: 120,
          }}
          styles={{
            tooltip: {
              border: '1px solid hsl(var(--border))',
              borderRadius: 16,
              boxShadow: '0 18px 48px rgba(0, 0, 0, 0.24)',
              fontFamily: 'Outfit, sans-serif',
            },
            tooltipTitle: { fontSize: 16, fontWeight: 600 },
            tooltipContent: { fontSize: 14, lineHeight: 1.5 },
            buttonSkip: { color: 'hsl(var(--muted-foreground))', fontSize: 13 },
          }}
        />
      </>
    );
  },
);

export default QuickWalkthrough;
