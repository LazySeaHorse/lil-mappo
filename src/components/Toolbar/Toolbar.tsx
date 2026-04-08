import React, { useRef, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { MAP_STYLES } from '@/config/mapbox';
import { useResponsive } from '@/hooks/useResponsive';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  FilePlus2, Save, Library, FileJson, Upload, Settings, ChevronDown,
} from 'lucide-react';
import {
  RIGHT_RESERVED_DESKTOP,
  RIGHT_RESERVED_TABLET,
  PANEL_MARGIN,
  PANEL_GAP
} from '@/constants/layout';
import { useToolbarActions } from './useToolbarActions';
import { MobileToolbarLayout } from './MobileToolbarLayout';
import { DesktopToolbarLayout } from './DesktopToolbarLayout';

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

  const renderProjectMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={`h-8 ${isMobile || isTablet ? 'px-1' : 'px-2.5'} flex items-center gap-1.5 text-xs font-medium focus-visible:ring-0`} title="Project Settings">
          {!isMobile && !isTablet && <span>Project</span>}
          <ChevronDown size={14} className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 overflow-hidden bg-background/95 border-border/50 shadow-2xl rounded-2xl">
        <DropdownMenuItem onClick={actions.handleNewProject} className="gap-2 cursor-pointer py-2.5"><FilePlus2 size={14} /> New Project</DropdownMenuItem>
        <DropdownMenuItem onClick={actions.handleSaveToLibrary} className="gap-2 cursor-pointer py-2.5"><Save size={14} /> Save to Library</DropdownMenuItem>
        <DropdownMenuItem onClick={onLibrary} className="gap-2 cursor-pointer py-2.5"><Library size={14} /> My Projects...</DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border/50" />
        <DropdownMenuItem onClick={actions.handleExportProject} className="gap-2 cursor-pointer py-2.5"><FileJson size={14} /> Export Project File</DropdownMenuItem>
        <DropdownMenuItem onClick={() => projectInputRef.current?.click()} className="gap-2 cursor-pointer py-2.5"><Upload size={14} /> Import Project File</DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border/50" />
        <DropdownMenuItem onClick={() => { setProjectSettingsTab('general'); selectItem(null); }} className="gap-2 cursor-pointer py-2.5"><Settings size={14} /> Project Settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
          renderProjectMenu={renderProjectMenu}
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
          renderProjectMenu={renderProjectMenu}
          handleAddCameraKF={actions.handleAddCameraKF}
          {...layerProps}
        />
      )}
    </div>
  );
}
