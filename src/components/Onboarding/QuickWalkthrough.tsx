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
  'complete' | 'prepare-render' | 'route-editor' | 'boundary-editor' | 'callout-editor'
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
    const [isMapStyleOpen, setIsMapStyleOpen] = useState(false);
    const [isMapToolsOpen, setIsMapToolsOpen] = useState(false);
    const usesLayerMenu = isMobile || isTablet;
    const [walkthrough, setWalkthrough] = useState(() =>
      createWalkthroughState(isMobile, 0, usesLayerMenu),
    );
    const cameraKeyframeCount = useProjectStore((state) => {
      const camera = state.items[CAMERA_TRACK_ID] as CameraItem | undefined;
      return camera?.keyframes.length ?? 0;
    });
    const playheadTime = useProjectStore((state) => state.playheadTime);
    const selectedKeyframeId = useProjectStore((state) => state.selectedKeyframeId);
    const mapStyle = useProjectStore((state) => state.mapStyle);
    const projectSettingsTab = useProjectStore((state) => state.projectSettingsTab);
    const clearedSelectionForPrompt = useRef(false);

    const send = useCallback((event: WalkthroughEvent) => {
      setWalkthrough((current) => walkthroughReducer(current, event));
    }, []);

    const start = useCallback(() => {
      setShowInvitation(false);
      useProjectStore.getState().setIsInspectorOpen(false);
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
      if (!isRunning || walkthrough.stage !== 'move-playhead') return;
      useProjectStore.getState().setIsInspectorOpen(false);
      send({ type: 'playhead-time-changed', time: playheadTime });
    }, [isRunning, playheadTime, send, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'second-keyframe') return;

      const target = document.querySelector<HTMLElement>('[data-walkthrough="camera-keyframe"]');
      target?.classList.add('animate-pulse', 'ring-2', 'ring-primary/60');
      return () => {
        target?.classList.remove('animate-pulse', 'ring-2', 'ring-primary/60');
      };
    }, [isRunning, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'play-animation') return;
      useProjectStore.getState().setPlayheadTime(0);
    }, [isRunning, walkthrough.stage]);

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
      if (!isRunning || walkthrough.stage !== 'prepare-render') return;
      useProjectStore.getState().setIsInspectorOpen(false);

      const layoutDelay = window.setTimeout(() => {
        send({ type: 'render-layout-ready' });
      }, 350);
      return () => window.clearTimeout(layoutDelay);
    }, [isRunning, send, walkthrough.stage]);

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
      toast.success('Tour complete. You can now create your map animation.');
    }, [isRunning, walkthrough.stage]);

    const stages = useMemo<VisibleWalkthroughStage[]>(() => [
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
    ], [isMobile, usesLayerMenu]);

    const steps = useMemo<Step[]>(() => {
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

      const byStage: Record<VisibleWalkthroughStage, Step> = {
        'map-controls': {
          target: '[data-walkthrough="map-coachmark-anchor"]',
          spotlightTarget: '[data-walkthrough="map-viewport"]',
          title: 'Learn the map controls',
          placement: 'right-start',
          spotlightPadding: 0,
          floatingOptions: { hideArrow: true, flipOptions: false },
          content: (
            <div className="space-y-2.5 text-left">
              <GestureStatus complete={walkthrough.gestures.pan}>{mapControlCopy.pan}</GestureStatus>
              <GestureStatus
                complete={walkthrough.gestures.orbit}
                subtext={isMobile ? undefined : 'You can also hold Ctrl and left-drag.'}
              >
                {mapControlCopy.orbit}
              </GestureStatus>
              <GestureStatus complete={walkthrough.gestures.zoom}>{mapControlCopy.zoom}</GestureStatus>
            </div>
          ),
        },
        'open-add-menu': {
          target: '[data-walkthrough="add-menu"]',
          title: 'Open the Add menu',
          content: 'Tap here to add camera views, routes, boundaries, and location pins.',
          placement: 'bottom-start',
        },
        'first-keyframe': {
          target: '[data-walkthrough="camera-keyframe"]',
          title: 'Save your first view',
          content: 'Click the camera button to save this position as your starting keyframe.',
          placement: 'bottom',
        },
        'move-playhead': {
          target: '[data-walkthrough="timeline-panel"]',
          title: 'Move forward on the timeline',
          content: 'Drag the blue playhead marker to the right to set the time for your next view.',
          placement: 'top-start',
          spotlightPadding: 0,
          skipScroll: true,
        },
        'second-keyframe': {
          target: '[data-walkthrough="camera-keyframe"]',
          title: 'Save your second view',
          content: 'Move the map to a new location. Then click the camera button again to save your second keyframe.',
          placement: 'bottom',
          hideOverlay: true,
        },
        'play-animation': {
          target: '[data-walkthrough="timeline-play"]',
          title: 'Preview your animation',
          content: 'Click the Play button to watch the camera move smoothly between your two saved views.',
          placement: 'top',
          buttons: ['skip', 'primary'],
          locale: { next: 'Next' },
        },
        'select-keyframe': {
          target: '[data-walkthrough="timeline-keyframe"]',
          spotlightTarget: '[data-walkthrough="timeline-panel"]',
          title: 'Select a keyframe',
          content: 'Click any keyframe marker on the timeline to open its settings panel.',
          placement: 'top',
          spotlightPadding: 0,
          skipScroll: true,
        },
        'inspect-keyframe': {
          target: '[data-walkthrough="inspector-panel"]',
          title: 'Adjust keyframe settings',
          content: 'Use the side panel to adjust time, camera angle, zoom level, and animation speed.',
          placement: isMobile ? 'top' : 'left-start',
          buttons: ['skip', 'primary'],
          locale: { next: 'Continue' },
        },
        route: {
          target: '[data-walkthrough="add-route"]',
          title: 'Add a travel route',
          content: 'Draw a driving, walking, or flight path on the map. You can also import GPX and KML files.',
          placement: 'bottom',
        },
        boundary: {
          target: '[data-walkthrough="add-boundary"]',
          title: 'Highlight a boundary',
          content: 'Search and highlight any country, state, or custom region on the map.',
          placement: 'bottom',
        },
        callout: {
          target: '[data-walkthrough="add-callout"]',
          title: 'Add a location label',
          content: 'Place an animated 3D pin and label to highlight an important location.',
          placement: 'bottom',
        },
        'open-map-tools': {
          target: '[data-walkthrough="map-tools"]',
          title: 'Open Map Display',
          content: 'Tap the Map Display button to view style and 3D landscape options.',
          placement: 'bottom',
        },
        'terrain-buildings': {
          target: '[data-walkthrough="map-3d"]',
          title: 'Enable 3D terrain and buildings',
          content: 'Turn on Terrain for realistic hills and mountains. Turn on Buildings to show 3D city structures.',
          placement: 'bottom',
          buttons: ['skip', 'primary'],
          locale: { next: 'Next' },
        },
        'change-map-style': {
          target: isTablet ? '[data-walkthrough="map-tools"]' : '[data-walkthrough="map-style"]',
          title: 'Change the map style',
          content: isTablet
            ? 'Open Map Display. Select another style, such as Satellite or Dark.'
            : 'Open the style menu. Select another style, such as Satellite or Dark.',
          placement: 'bottom',
        },
        'return-standard-style': {
          target: isTablet ? '[data-walkthrough="map-tools"]' : '[data-walkthrough="map-style"]',
          title: 'Reset to Standard style',
          content: isTablet
            ? 'Open Map Display again. Select the Standard style.'
            : 'Open the style menu again. Select the Standard style.',
          placement: 'bottom',
        },
        'map-settings': {
          target: isTablet ? '[data-walkthrough="map-tools"]' : '[data-walkthrough="map-settings"]',
          title: 'Open Project Settings',
          content: isTablet
            ? 'Open Map Display, then choose Full Map Settings.'
            : 'Click Settings to configure global project and map options.',
          placement: 'bottom',
        },
        'map-settings-tab': {
          target: '[data-walkthrough="project-settings-map-tab"]',
          spotlightTarget: '[data-walkthrough="inspector-panel"]',
          title: 'Select the Map tab',
          content: 'Click the Map tab to view environment and visual settings.',
          placement: isMobile ? 'top' : 'left-start',
        },
        'map-settings-overview': {
          target: '[data-walkthrough="inspector-panel"]',
          title: 'Customize the map environment',
          content: 'Use this tab to adjust map projection, sun lighting, sky atmosphere, and place labels.',
          placement: isMobile ? 'top' : 'left-start',
          buttons: ['skip', 'primary'],
          locale: { next: 'Next' },
        },
        render: {
          target: '[data-walkthrough="render"]',
          title: 'Export your video',
          content: 'Click Export when you want to download your finished video. You do not need to export now.',
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
    }, [isMobile, isTablet, stages, walkthrough.gestures]);

    const visibleStepIndex = stages.indexOf(walkthrough.stage as VisibleWalkthroughStage);
    const hasVisibleStep = visibleStepIndex >= 0;
    const stepIndex = Math.max(0, visibleStepIndex);
    const isUsingAddTool = walkthrough.stage.endsWith('-editor');
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
        (walkthrough.stage === 'play-animation' ||
          walkthrough.stage === 'inspect-keyframe' ||
          walkthrough.stage === 'map-settings-overview' ||
          walkthrough.stage === 'terrain-buildings') &&
        event.action === ACTIONS.NEXT &&
        event.origin === ORIGIN.BUTTON_PRIMARY
      ) {
        if (walkthrough.stage === 'play-animation') {
          useProjectStore.getState().setIsPlaying(false);
          send({ type: 'play-preview-acknowledged' });
        } else if (walkthrough.stage === 'inspect-keyframe') {
          send({ type: 'inspector-acknowledged' });
        } else if (walkthrough.stage === 'map-settings-overview') {
          send({ type: 'map-settings-overview-acknowledged' });
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
              <AlertDialogTitle>Start the quick tour?</AlertDialogTitle>
              <AlertDialogDescription>
                Learn how to navigate the map and create your first video animation. This tour takes 90 seconds.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => storeStatus('dismissed')}>Not now</AlertDialogCancel>
              <AlertDialogAction onClick={start}>Start tour</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Joyride
          run={isRunning && hasVisibleStep && !isUsingAddTool && !isUsingStylePopup}
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
