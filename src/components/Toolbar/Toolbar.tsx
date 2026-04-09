import React, { useRef, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useResponsive } from '@/hooks/useResponsive';
import {
  RIGHT_RESERVED_DESKTOP,
  RIGHT_RESERVED_TABLET,
  PANEL_MARGIN,
} from '@/constants/layout';
import { useToolbarActions } from './useToolbarActions';
import { MobileToolbarLayout } from './MobileToolbarLayout';
import { DesktopToolbarLayout } from './DesktopToolbarLayout';
import { AvatarMenu } from '@/components/Account/AvatarMenu';

interface ToolbarProps {
  onExport: () => void;
  onLibrary: () => void;
}

export default function Toolbar({ onExport, onLibrary }: ToolbarProps) {
  const routeInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [mobileMode, setMobileMode] = useState<'default' | 'add' | 'layers'>('default');
  const [activeDropdown, setActiveDropdown] = useState<'route' | 'callout' | 'boundary' | null>(null);

  const {
    isPlaying, mapStyle, setMapStyle,
    terrainEnabled, setTerrainEnabled, buildingsEnabled, setBuildingsEnabled,
    terrainLoading, buildingsLoading,
    selectItem, setHideUI, isInspectorOpen, isScrubbing,
    setProjectSettingsTab,
  } = useProjectStore();

  const { isMobile, isTablet } = useResponsive();
  const actions = useToolbarActions();

  const rightMarginVal = !isInspectorOpen || isMobile ? PANEL_MARGIN : isTablet ? RIGHT_RESERVED_TABLET : RIGHT_RESERVED_DESKTOP;
  const finalRightMargin = isMobile ? '0px' : `${rightMarginVal}px`;
  const finalLeftMargin = isMobile ? '0px' : `${PANEL_MARGIN}px`;
  const finalTopMargin = isMobile ? '0px' : `${PANEL_MARGIN}px`;
  const finalRounded = isMobile ? 'rounded-none' : 'rounded-2xl';

  const renderAvatarMenu = () => (
    <AvatarMenu
      onLibrary={onLibrary}
      onImportProjectClick={() => projectInputRef.current?.click()}
    />
  );

  const layerProps = {
    mapStyle, setMapStyle,
    terrainEnabled, setTerrainEnabled,
    buildingsEnabled, setBuildingsEnabled,
    terrainLoading, buildingsLoading,
    isScrubbing,
  };

  return (
    <div
      className={`h-14 ${finalRounded} absolute bg-background/85 backdrop-blur-xl border border-border/50 flex items-center px-4 shadow-2xl shadow-black/10 pointer-events-auto z-50 transition-all duration-300`}
      style={{ top: finalTopMargin, left: finalLeftMargin, right: finalRightMargin }}
    >
      <input ref={routeInputRef} type="file" accept=".kml,.gpx" multiple className="hidden" onChange={actions.handleImport} />
      <input ref={projectInputRef} type="file" accept=".lilmap,.json" className="hidden" onChange={actions.handleImportProject} />

      {isMobile || isTablet ? (
        <MobileToolbarLayout
          mobileMode={mobileMode}
          setMobileMode={setMobileMode}
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          onExport={onExport}
          onImportClick={() => routeInputRef.current?.click()}
          onHideUI={() => setHideUI(true)}
          renderAvatarMenu={renderAvatarMenu}
          handleAddCameraKF={actions.handleAddCameraKF}
          isPlaying2={isPlaying}
          {...layerProps}
        />
      ) : (
        <DesktopToolbarLayout
          isTablet={false}
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          isPlaying={isPlaying}
          onExport={onExport}
          onImportClick={() => routeInputRef.current?.click()}
          onHideUI={() => setHideUI(true)}
          onProjectSettings={() => { setProjectSettingsTab('map'); selectItem(null); }}
          renderAvatarMenu={renderAvatarMenu}
          handleAddCameraKF={actions.handleAddCameraKF}
          {...layerProps}
        />
      )}
    </div>
  );
}
