import React, { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useShallow } from 'zustand/react/shallow';
import { useResponsive } from '@/hooks/useResponsive';
import {
  rightReserved,
  PANEL_MARGIN,
} from '@/constants/layout';
import { useToolbarActions } from './useToolbarActions';
import { openProjectSettings } from './openProjectSettings';
import { MobileToolbarLayout } from './MobileToolbarLayout';
import { DesktopToolbarLayout } from './DesktopToolbarLayout';
import { AvatarMenu } from '@/components/Account/AvatarMenu';
import type { WalkthroughAddTool } from '@/components/Onboarding/walkthroughState';
import { useWalkthroughStore } from '@/components/Onboarding/useWalkthroughStore';

interface ToolbarProps {
  onExport: () => void;
  onLibrary: () => void;
  onWalkthrough: () => void;
  onAddToolOpenChange: (tool: WalkthroughAddTool, open: boolean) => boolean | undefined;
}

export default function Toolbar({
  onExport,
  onLibrary,
  onWalkthrough,
  onAddToolOpenChange,
}: ToolbarProps) {
  const routeInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [mobileMode, setMobileMode] = useState<'default' | 'add' | 'layers'>('default');
  const [activeDropdown, setActiveDropdown] = useState<'route' | 'callout' | 'boundary' | null>(null);
  const previousActiveDropdown = useRef<typeof activeDropdown>(null);

  useEffect(() => {
    const previous = previousActiveDropdown.current;
    if (previous === activeDropdown) return;
    if (previous) {
      const wasWalkthroughActive = onAddToolOpenChange(previous, false);
      // Once the tour has its route, it goes on to Play and Export, which the Add menu hides on a phone.
      const tourHasRoute = useWalkthroughStore.getState().walkthrough.stage === 'follow-route';
      if (wasWalkthroughActive && previous === 'route' && tourHasRoute) setMobileMode('default');
    }
    if (activeDropdown) onAddToolOpenChange(activeDropdown, true);
    previousActiveDropdown.current = activeDropdown;
  }, [activeDropdown, onAddToolOpenChange]);

  const {
    isPlaying, mapStyle, setMapStyle,
    terrainEnabled, setTerrainEnabled, buildingsEnabled, setBuildingsEnabled,
    terrainLoading,
    setHideUI, isFitMode, setFitMode, isInspectorOpen, isScrubbing,
  } = useProjectStore(
    useShallow(s => ({
      isPlaying: s.isPlaying, mapStyle: s.mapStyle, setMapStyle: s.setMapStyle,
      terrainEnabled: s.terrainEnabled, setTerrainEnabled: s.setTerrainEnabled,
      buildingsEnabled: s.buildingsEnabled, setBuildingsEnabled: s.setBuildingsEnabled,
      terrainLoading: s.terrainLoading,
      setHideUI: s.setHideUI,
      isFitMode: s.isFitMode, setFitMode: s.setFitMode,
      isInspectorOpen: s.isInspectorOpen, isScrubbing: s.isScrubbing,
    }))
  );

  const { isMobile, isTablet, isToolbarCollapsed, isLayersCollapsed } = useResponsive();
  const actions = useToolbarActions();

  const rightMarginVal = rightReserved({ isInspectorOpen, isMobile, isTablet });
  const finalRightMargin = isMobile ? '0px' : `${rightMarginVal}px`;
  const finalLeftMargin = isMobile ? '0px' : `${PANEL_MARGIN}px`;
  const finalTopMargin = isMobile ? 'env(safe-area-inset-top, 0px)' : `${PANEL_MARGIN}px`;
  const finalRounded = isMobile ? 'rounded-none' : 'rounded-2xl';

  const renderAvatarMenu = () => (
    <AvatarMenu
      onLibrary={onLibrary}
      onImportProjectClick={() => projectInputRef.current?.click()}
      onWalkthrough={onWalkthrough}
    />
  );

  const layerProps = {
    mapStyle, setMapStyle,
    terrainEnabled, setTerrainEnabled,
    buildingsEnabled, setBuildingsEnabled,
    terrainLoading,
    isScrubbing,
  };

  return (
    <div
      data-ph-unmask
      className={`h-14 ${finalRounded} absolute bg-background/85 backdrop-blur-xl border border-border/50 flex items-center px-4 shadow-2xl shadow-black/10 pointer-events-auto z-50 transition-all duration-300`}
      style={{ top: finalTopMargin, left: finalLeftMargin, right: finalRightMargin }}
    >
      <input ref={routeInputRef} type="file" accept=".kml,.gpx,.geojson,.json" multiple className="hidden" onChange={actions.handleImport} />
      <input ref={projectInputRef} type="file" accept=".lilmap,.json" className="hidden" onChange={actions.handleImportProject} />

      {isToolbarCollapsed ? (
        <MobileToolbarLayout
          mobileMode={mobileMode}
          setMobileMode={setMobileMode}
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          onExport={onExport}
          onImportClick={() => actions.pickRouteFile(routeInputRef.current)}
          onHideUI={() => setHideUI(true)}
          renderAvatarMenu={renderAvatarMenu}
          handleAddCameraKF={actions.handleAddCameraKF}
          onProjectSettings={() => {
            setMobileMode('default');
            openProjectSettings({ scrollTo: 'map' });
          }}
          hideAi={isMobile}
          isPlaying2={isPlaying}
          {...layerProps}
        />
      ) : (
        <DesktopToolbarLayout
          isTablet={isLayersCollapsed}
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          isPlaying={isPlaying}
          onExport={onExport}
          onImportClick={() => actions.pickRouteFile(routeInputRef.current)}
          onHideUI={() => setHideUI(true)}
          isFitMode={isFitMode}
          onToggleFit={() => setFitMode(!isFitMode)}
          onProjectSettings={() => openProjectSettings({ scrollTo: 'map' })}
          renderAvatarMenu={renderAvatarMenu}
          handleAddCameraKF={actions.handleAddCameraKF}
          {...layerProps}
        />
      )}
    </div>
  );
}
