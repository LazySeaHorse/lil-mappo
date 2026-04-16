import React, { useRef, useState } from "react";
import type { MapRef } from "react-map-gl/mapbox";
import Toolbar from "@/components/Toolbar/Toolbar";
import MapViewport from "@/components/MapViewport/MapViewport";
import { MapLoadGate } from "@/components/MapLoadGate";
import InspectorPanel from "@/components/Inspector/InspectorPanel";
import TimelinePanel from "@/components/Timeline/TimelinePanel";
import ExportModal from "@/components/ExportModal/ExportModal";
import ProjectLibraryModal from "@/components/ProjectLibrary/ProjectLibraryModal";
import { usePlayback } from "@/hooks/usePlayback";
import { MapRefContext } from "@/hooks/useMapRef";
import FontLoader from "@/components/FontLoader";
import { useEffect } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useSubscription } from "@/hooks/useSubscription";
import { isFreeUser, hasByok } from "@/lib/cloudAccess";
import { useMapLoadGate } from "@/hooks/useMapLoadGate";
import { syncProjects } from "@/services/cloudSync";
import { toast } from "sonner";
import { Eye, Play, Pause, Camera } from "lucide-react";
import { takeSnapshot } from "@/services/snapshot";
import { useResponsive } from "@/hooks/useResponsive";
import { Toaster as Sonner } from "@/components/ui/sonner";
import {
  RIGHT_RESERVED_DESKTOP,
  RIGHT_RESERVED_TABLET,
  PANEL_MARGIN,
} from "@/constants/layout";
import { IconButton } from "@/components/ui/icon-button";
import { AuthModal } from "@/components/Account/AuthModal";
import { AccountSettingsModal } from "@/components/Account/AccountSettingsModal";
import { CreditsModal } from "@/components/Account/CreditsModal";
import { RendersModal } from "@/components/Account/RendersModal";

function useSonnerPosition({
  hideUI,
  isMobile,
  isInspectorOpen,
  isTablet,
  timelineHeight,
}: {
  hideUI: boolean;
  isMobile: boolean;
  isInspectorOpen: boolean;
  isTablet: boolean;
  timelineHeight: number;
}): React.CSSProperties {
  const zenOrMobileInspector = hideUI || (isMobile && isInspectorOpen);

  // Center horizontally in the remaining map area
  const rightMargin =
    !isInspectorOpen || isMobile
      ? PANEL_MARGIN
      : isTablet
        ? RIGHT_RESERVED_TABLET
        : RIGHT_RESERVED_DESKTOP;
  const leftMargin = PANEL_MARGIN;

  const bottom = zenOrMobileInspector
    ? PANEL_MARGIN * 2
    : timelineHeight + PANEL_MARGIN * 2;

  const left = zenOrMobileInspector
    ? "50%"
    : `calc(50% + (${leftMargin}px - ${rightMargin}px) / 2)`;

  return {
    position: "absolute",
    bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`,
    left,
    transform: "translateX(-50%)",
    zIndex: 100,
    pointerEvents: "none",
  };
}

function ZenModeControls({
  isMobile,
  isPlaying,
  onShowUI,
  onTogglePlay,
  mapRef,
}: {
  isMobile: boolean;
  isPlaying: boolean;
  onShowUI: () => void;
  onTogglePlay: () => void;
  mapRef: React.MutableRefObject<MapRef | null>;
}) {
  return (
    <div
      className="absolute z-50 pointer-events-auto flex gap-2.5 transition-all duration-500 top-4 right-4"
    >
      <IconButton
        variant="zen"
        size="lg"
        onClick={onTogglePlay}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </IconButton>
      <IconButton 
        variant="zen" 
        size="lg" 
        onClick={() => takeSnapshot(mapRef)} 
        title="Take High-Res Snapshot"
      >
        <Camera size={20} />
      </IconButton>
      <IconButton variant="zen" size="lg" onClick={onShowUI} title="Show UI">
        <Eye size={20} />
      </IconButton>
    </div>
  );
}

export default function MapStudioEditor() {
  const mapRef = useRef<MapRef | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const { isMobile, isTablet } = useResponsive();
  usePlayback(mapRef);
  const mapLoadGate = useMapLoadGate();
  const { user, openAuthModal } = useAuthStore();
  const isLocked = !user && !hasByok();
  const { data: subscription } = useSubscription();
  // Track whether we've synced for this user session to avoid repeat syncs
  const syncedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Only sync once per user session (not on every subscription/credits reload)
    if (syncedUserId.current === user.id) return;
    syncedUserId.current = user.id;

    // Wanderer subscribers get bidirectional cloud sync; free users don't auto-sync.
    const cloudEnabled = !isFreeUser(subscription);
    syncProjects(cloudEnabled).then((result) => {
      if (result.offline) {
        toast.error("Couldn't sync — you're offline");
      }
    }).catch(() => {
      // Sync errors are non-fatal on startup
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const mapStyle = useProjectStore((s) => s.mapStyle);
  const hideUI = useProjectStore((s) => s.hideUI);
  const setHideUI = useProjectStore((s) => s.setHideUI);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const setIsPlaying = useProjectStore((s) => s.setIsPlaying);
  const timelineHeight = useProjectStore((s) => s.timelineHeight);
  const isInspectorOpen = useProjectStore((s) => s.isInspectorOpen);

  useEffect(() => {
    const isDark =
      mapStyle === "dark" ||
      mapStyle === "satellite" ||
      mapStyle === "satelliteStreets";
    document.documentElement.classList.toggle("dark", isDark);
  }, [mapStyle]);

  useEffect(() => {
    document.documentElement.classList.toggle("hide-ui-active", hideUI);
  }, [hideUI]);

  const sonnerStyle = useSonnerPosition({
    hideUI,
    isMobile,
    isInspectorOpen,
    isTablet,
    timelineHeight,
  });

  return (
    <MapRefContext.Provider value={mapRef}>
      <FontLoader />
      <Sonner style={sonnerStyle as React.CSSProperties} />
      <div className="h-dvh w-screen relative overflow-hidden bg-background">
        {/* Map Background Layer — wrapped in gate to prevent loads over quota */}
        <div className="absolute inset-0 z-0">
          <MapLoadGate gate={mapLoadGate}>
            <MapViewport mapRef={mapRef} onMapReady={mapLoadGate.onMapLoaded} />
          </MapLoadGate>
        </div>

        {/* Floating UI Layer */}
        <div
          className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-500 ${hideUI ? "opacity-0 invisible" : "opacity-100 visible"}`}
        >
          <Toolbar
            onExport={() => {
              if (isLocked) openAuthModal();
              else setShowExport(true);
            }}
            onLibrary={() => {
              if (isLocked) openAuthModal();
              else setShowLibrary(true);
            }}
          />
          <InspectorPanel />
          <TimelinePanel />
        </div>

        {hideUI && (
          <ZenModeControls
            isMobile={isMobile}
            isPlaying={isPlaying}
            onShowUI={() => setHideUI(false)}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            mapRef={mapRef}
          />
        )}

        {showExport && <ExportModal onClose={() => setShowExport(false)} />}
        {showLibrary && (
          <ProjectLibraryModal onClose={() => setShowLibrary(false)} />
        )}

        {/* Account Modals */}
        <AuthModal />
        <AccountSettingsModal />
        <CreditsModal />
        <RendersModal />
      </div>
    </MapRefContext.Provider>
  );
}
