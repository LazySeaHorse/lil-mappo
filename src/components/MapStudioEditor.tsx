import React, { useRef, useState } from "react";
import type { MapRef } from "react-map-gl/mapbox";
import Toolbar from "@/components/Toolbar/Toolbar";
import MapViewport from "@/components/MapViewport/MapViewport";
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
import { useCredits } from "@/hooks/useCredits";
import { canCloudSave } from "@/lib/cloudAccess";
import { syncProjects } from "@/services/cloudSync";
import { toast } from "sonner";
import { Eye, Play, Pause } from "lucide-react";
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
    bottom: `${bottom}px`,
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
}: {
  isMobile: boolean;
  isPlaying: boolean;
  onShowUI: () => void;
  onTogglePlay: () => void;
}) {
  return (
    <div
      className={`absolute z-50 pointer-events-auto flex gap-2.5 transition-all duration-500 ${isMobile ? "bottom-6 left-1/2 -translate-x-1/2" : "top-4 left-4"}`}
    >
      <IconButton variant="zen" size="lg" onClick={onShowUI} title="Show UI">
        <Eye size={20} />
      </IconButton>
      <IconButton
        variant="zen"
        size="lg"
        onClick={onTogglePlay}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
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

  // ── Initial cloud sync on sign-in ──────────────────────────────────────────
  const user = useAuthStore((s) => s.user);
  const { data: subscription } = useSubscription();
  const { data: credits } = useCredits();
  // Track whether we've synced for this user session to avoid repeat syncs
  const syncedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Only sync once per user session (not on every subscription/credits reload)
    if (syncedUserId.current === user.id) return;
    syncedUserId.current = user.id;

    const cloudEnabled = canCloudSave(subscription, credits);
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
      <div className="h-screen w-screen relative overflow-hidden bg-background">
        {/* Map Background Layer */}
        <div className="absolute inset-0 z-0">
          <MapViewport mapRef={mapRef} />
        </div>

        {/* Floating UI Layer */}
        <div
          className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-500 ${hideUI ? "opacity-0 invisible" : "opacity-100 visible"}`}
        >
          <Toolbar
            onExport={() => setShowExport(true)}
            onLibrary={() => setShowLibrary(true)}
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
