import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopToolbarLayout } from './DesktopToolbarLayout';
import { MobileToolbarLayout } from './MobileToolbarLayout';
import { CAMERA_VIEW_TERMS } from '@/lib/terms';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
vi.mock('./RouteAddDropdown', () => ({ RouteAddDropdown: () => null }));
vi.mock('./BoundaryAddDropdown', () => ({ BoundaryAddDropdown: () => null }));
vi.mock('@/annotations/toolbar/AnnotationAddDropdown', () => ({ AnnotationAddDropdown: () => null }));
vi.mock('@/components/AI/AiToolbarButton', () => ({ AiToolbarButton: () => null }));
vi.mock('./ModelImportButton', () => ({ ModelImportButton: () => null }));
vi.mock('./HistoryButtons', () => ({ HistoryButtons: () => null }));

const props = {
  mapStyle: 'standard',
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
};

describe('the add camera view button', () => {
  it('has the shared tooltip on desktop and on a phone', () => {
    render(
      <>
        <DesktopToolbarLayout {...props} isTablet={false} isPlaying={false} />
        <MobileToolbarLayout {...props} mobileMode="add" setMobileMode={vi.fn()} isPlaying2={false} />
      </>,
    );
    expect(screen.getAllByTitle(CAMERA_VIEW_TERMS.add)).toHaveLength(2);
    expect(screen.queryByTitle('Camera Keyframe')).not.toBeInTheDocument();
  });
});
