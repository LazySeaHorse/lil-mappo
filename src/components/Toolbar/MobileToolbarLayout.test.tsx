import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileToolbarLayout } from './MobileToolbarLayout';
import { useWalkthroughStore } from '@/components/Onboarding/useWalkthroughStore';
import { createWalkthroughState } from '@/components/Onboarding/walkthroughState';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
vi.mock('./RouteAddDropdown', () => ({ RouteAddDropdown: () => null }));
vi.mock('./BoundaryAddDropdown', () => ({ BoundaryAddDropdown: () => null }));
vi.mock('@/annotations/toolbar/AnnotationAddDropdown', () => ({ AnnotationAddDropdown: () => null }));
vi.mock('./ModelImportButton', () => ({ ModelImportButton: () => null }));
vi.mock('./HistoryButtons', () => ({ HistoryButtons: () => null }));
vi.mock('@/components/AI/AiToolbarButton', () => ({ AiToolbarButton: () => <button>AI</button> }));

const props = {
  mobileMode: 'default' as const,
  setMobileMode: vi.fn(),
  activeDropdown: null,
  setActiveDropdown: vi.fn(),
  onExport: vi.fn(),
  onImportClick: vi.fn(),
  onHideUI: vi.fn(),
  renderAvatarMenu: () => null,
  mapStyle: 'standard',
  setMapStyle: vi.fn(),
  terrainEnabled: false,
  setTerrainEnabled: vi.fn(),
  buildingsEnabled: false,
  setBuildingsEnabled: vi.fn(),
  terrainLoading: false,
  isPlaying2: false,
  isScrubbing: false,
  handleAddCameraKF: vi.fn(),
  onProjectSettings: vi.fn(),
};

describe('MobileToolbarLayout AI button', () => {
  it('shows the AI button on the collapsed floating bar', () => {
    render(<MobileToolbarLayout {...props} />);
    expect(screen.getByText('AI')).toBeTruthy();
  });

  it('does not render the AI button on phones', () => {
    render(<MobileToolbarLayout {...props} hideAi />);
    expect(screen.queryByText('AI')).toBeNull();
  });
});

describe('MobileToolbarLayout Add menu', () => {
  it('opens the Add menu and tells the quick tour', () => {
    const setMobileMode = vi.fn();
    useWalkthroughStore.setState({ walkthrough: { ...createWalkthroughState(true, 0), stage: 'open-add-menu' } });
    render(<MobileToolbarLayout {...props} setMobileMode={setMobileMode} />);

    fireEvent.click(screen.getByTitle('Add New Track'));

    expect(setMobileMode).toHaveBeenCalledWith('add');
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('route');
  });
});

