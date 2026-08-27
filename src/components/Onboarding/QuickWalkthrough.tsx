import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { Joyride, STATUS, type EventData, type Step } from 'react-joyride';
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
}

interface QuickWalkthroughProps {
  isMapReady: boolean;
  isMobile: boolean;
}

function GestureStatus({ complete, children }: { complete: boolean; children: React.ReactNode }) {
  const Icon = complete ? Check : Circle;

  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon
        size={15}
        className={complete ? 'text-primary' : 'text-muted-foreground/60'}
        aria-hidden="true"
      />
      <span className={complete ? 'text-foreground' : 'text-muted-foreground'}>{children}</span>
    </div>
  );
}

const QuickWalkthrough = forwardRef<QuickWalkthroughHandle, QuickWalkthroughProps>(
  function QuickWalkthrough({ isMapReady, isMobile }, ref) {
    const [showInvitation, setShowInvitation] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [walkthrough, setWalkthrough] = useState(() => createWalkthroughState(isMobile, 0));
    const cameraKeyframeCount = useProjectStore((state) => {
      const camera = state.items[CAMERA_TRACK_ID] as CameraItem | undefined;
      return camera?.keyframes.length ?? 0;
    });

    const send = useCallback((event: WalkthroughEvent) => {
      setWalkthrough((current) => walkthroughReducer(current, event));
    }, []);

    const start = useCallback(() => {
      setShowInvitation(false);
      setWalkthrough(createWalkthroughState(isMobile, cameraKeyframeCount));
      setIsRunning(true);
      storeStatus('started');
    }, [cameraKeyframeCount, isMobile]);

    const recordMapGesture = useCallback((gesture: MapGesture) => {
      if (isRunning) send({ type: 'map-gesture', gesture });
    }, [isRunning, send]);

    useImperativeHandle(ref, () => ({ start, recordMapGesture }), [recordMapGesture, start]);

    useEffect(() => {
      if (!isMapReady || readStoredStatus()) return;

      const invitationDelay = window.setTimeout(() => setShowInvitation(true), 600);
      return () => window.clearTimeout(invitationDelay);
    }, [isMapReady]);

    useEffect(() => {
      if (!isRunning) return;
      send({ type: 'keyframe-count-changed', count: cameraKeyframeCount });
    }, [cameraKeyframeCount, isRunning, send]);

    useEffect(() => {
      if (!isRunning) return;

      const handleClick = (event: MouseEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        if (target.closest('[data-walkthrough="add-menu"]')) {
          send({ type: 'add-menu-opened' });
        } else if (target.closest('[data-walkthrough="add-route"]')) {
          send({ type: 'route-opened' });
        } else if (target.closest('[data-walkthrough="add-boundary"]')) {
          send({ type: 'boundary-opened' });
        } else if (target.closest('[data-walkthrough="add-callout"]')) {
          send({ type: 'callout-opened' });
        }
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

    const stages = useMemo<WalkthroughStage[]>(() => [
      'map-controls',
      ...(isMobile ? ['open-add-menu' as const] : []),
      'first-keyframe',
      'move-again',
      'second-keyframe',
      'route',
      'boundary',
      'callout',
    ], [isMobile]);

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

      const byStage: Record<Exclude<WalkthroughStage, 'complete'>, Step> = {
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
              <GestureStatus complete={walkthrough.gestures.orbit}>{mapControlCopy.orbit}</GestureStatus>
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
          content: 'Move the map to a different position for the end of your camera move.',
          placement: 'right-start',
          spotlightPadding: 0,
          floatingOptions: { hideArrow: true, flipOptions: false },
        },
        'second-keyframe': {
          target: '[data-walkthrough="camera-keyframe"]',
          title: 'Save the new view',
          content: 'Add another keyframe. The camera animates between your saved views.',
          placement: 'bottom',
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
      };

      return stages.map((stage) => ({
        ...byStage[stage as Exclude<WalkthroughStage, 'complete'>],
        buttons: ['skip'],
        skipBeacon: true,
        blockTargetInteraction: false,
        disableFocusTrap: true,
        overlayClickAction: false,
        targetWaitTimeout: 1500,
      }));
    }, [isMobile, stages, walkthrough.gestures]);

    const stepIndex = Math.max(0, stages.indexOf(walkthrough.stage));

    const handleTourEvent = useCallback((event: EventData) => {
      if (event.status !== STATUS.SKIPPED) return;
      setIsRunning(false);
      storeStatus('dismissed');
    }, []);

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
          run={isRunning}
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
