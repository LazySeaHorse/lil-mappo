import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STANDARD_CAPABILITIES } from '@/config/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { DesktopToolbarLayout } from './DesktopToolbarLayout';
import { MobileToolbarLayout } from './MobileToolbarLayout';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
vi.mock('./RouteAddDropdown', () => ({ RouteAddDropdown: () => null }));
vi.mock('./BoundaryAddDropdown', () => ({ BoundaryAddDropdown: () => null }));
vi.mock('@/annotations/toolbar/AnnotationAddDropdown', () => ({ AnnotationAddDropdown: () => null }));
vi.mock('@/components/AI/AiToolbarButton', () => ({ AiToolbarButton: () => null }));
vi.mock('./ModelImportButton', () => ({ ModelImportButton: () => null }));
vi.mock('./HistoryButtons', () => ({ HistoryButtons: () => null }));

const initialStore = useProjectStore.getState();

const layerProps = {
  setMapStyle: vi.fn(),
  terrainEnabled: false,
  setTerrainEnabled: vi.fn(),
  buildingsEnabled: false,
  setBuildingsEnabled: vi.fn(),
  terrainLoading: false,
  isScrubbing: false,
  onProjectSettings: vi.fn(),
  onExport: vi.fn(),
  onImportClick: vi.fn(),
  onHideUI: vi.fn(),
  renderAvatarMenu: () => null,
  handleAddCameraKF: vi.fn(),
  activeDropdown: null,
  setActiveDropdown: vi.fn(),
  isFitMode: false,
  onToggleFit: vi.fn(),
};

function renderToolbars(mapStyle: string) {
  render(
    <>
      <DesktopToolbarLayout {...layerProps} mapStyle={mapStyle} isTablet={false} isPlaying={false} />
      <MobileToolbarLayout {...layerProps} mapStyle={mapStyle} mobileMode="layers" setMobileMode={vi.fn()} isPlaying2={false} />
    </>,
  );
  return screen.getAllByTitle('Buildings');
}

beforeEach(() => {
  act(() => useProjectStore.setState(initialStore, true));
});

describe('Buildings toggle', () => {
  it('is enabled on Standard', () => {
    act(() => useProjectStore.setState({ mapStyle: 'standard', detectedCapabilities: STANDARD_CAPABILITIES }));
    const toggles = renderToolbars('standard');
    expect(toggles).toHaveLength(2);
    toggles.forEach((toggle) => expect(toggle).toBeEnabled());
  });

  it('is disabled on every classic style', () => {
    act(() => useProjectStore.setState({ mapStyle: 'streets', detectedCapabilities: { ...STANDARD_CAPABILITIES, buildings3d: false } }));
    renderToolbars('streets').forEach((toggle) => expect(toggle).toBeDisabled());
  });

  it('is disabled while the style is still loading and nothing is detected yet', () => {
    act(() => useProjectStore.setState({ mapStyle: 'streets', detectedCapabilities: null }));
    renderToolbars('streets').forEach((toggle) => expect(toggle).toBeDisabled());
  });
});
