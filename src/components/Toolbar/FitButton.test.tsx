import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopToolbarLayout } from './DesktopToolbarLayout';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
vi.mock('./RouteAddDropdown', () => ({ RouteAddDropdown: () => null }));
vi.mock('./BoundaryAddDropdown', () => ({ BoundaryAddDropdown: () => null }));
vi.mock('@/annotations/toolbar/AnnotationAddDropdown', () => ({ AnnotationAddDropdown: () => null }));
vi.mock('@/components/AI/AiToolbarButton', () => ({ AiToolbarButton: () => <button title="AI" /> }));
vi.mock('./ModelImportButton', () => ({ ModelImportButton: () => null }));
vi.mock('./HistoryButtons', () => ({ HistoryButtons: () => null }));

const props = {
  mapStyle: 'standard', setMapStyle: vi.fn(),
  terrainEnabled: false, setTerrainEnabled: vi.fn(),
  buildingsEnabled: false, setBuildingsEnabled: vi.fn(),
  terrainLoading: false, isScrubbing: false,
  onProjectSettings: vi.fn(), onExport: vi.fn(), onImportClick: vi.fn(), onHideUI: vi.fn(),
  renderAvatarMenu: () => null, handleAddCameraKF: vi.fn(),
  activeDropdown: null, setActiveDropdown: vi.fn(),
  isTablet: false, isPlaying: false, onToggleFit: vi.fn(),
};

describe('the fit button', () => {
  it('toggles fit mode, shows when it is on and has no text label', () => {
    const onToggleFit = vi.fn();
    const { rerender } = render(<DesktopToolbarLayout {...props} isFitMode={false} onToggleFit={onToggleFit} />);
    const button = screen.getByTitle('Fit to video frame');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('');
    fireEvent.click(button);
    expect(onToggleFit).toHaveBeenCalledTimes(1);
    rerender(<DesktopToolbarLayout {...props} isFitMode onToggleFit={onToggleFit} />);
    expect(screen.getByTitle('Fit to video frame')).toHaveAttribute('aria-pressed', 'true');
  });

  it('sits between the export separator and the zen mode button', () => {
    render(<DesktopToolbarLayout {...props} isFitMode={false} />);
    const order = ['AI', 'Export', 'Fit to video frame', 'Hide UI'].map((t) => screen.getByTitle(t));
    order.slice(1).forEach((el, i) => {
      expect(order[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });
});
