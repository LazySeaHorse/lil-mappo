import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/mapbox';
import { CameraKFInspector } from './CameraKFInspector';
import { MapRefContext } from '@/hooks/useMapRef';
import { useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { createCameraKeyframe } from '@/store/itemFactories';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import { INSPECTOR_SECTIONS } from './inspectorSections';
import { CAMERA_VIEW_TERMS, ITEM_TYPE_LABELS } from '@/lib/terms';
import type { CameraItem } from '@/store/types';

vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));

const easeTo = vi.fn();
const map = {
  getCenter: () => ({ lng: 12.5, lat: 41.9 }),
  getZoom: () => 13.5,
  getPitch: () => 50,
  getBearing: () => 75,
  easeTo,
};
const wrapper = ({ children }: { children: ReactNode }) => (
  <MapRefContext.Provider value={{ current: { getMap: () => map } as unknown as MapRef }}>{children}</MapRefContext.Provider>
);

const kf = createCameraKeyframe({ time: 2, center: [1, 2], zoom: 4, pitch: 10, bearing: 20 });
const item: CameraItem = { id: CAMERA_TRACK_ID, kind: 'camera', keyframes: [kf] };

beforeEach(() => {
  easeTo.mockClear();
  useUiPreferencesStore.setState({ inspectorSections: {} });
  useProjectStore.setState({
    items: { [item.id]: item },
    itemOrder: [item.id],
    selectedItemId: item.id,
    selectedKeyframeId: kf.id,
    isPlaying: false,
    isScrubbing: false,
    isExporting: false,
  });
});

describe('CameraKFInspector view buttons', () => {
  it('shows one line of help above the two buttons', () => {
    render(<CameraKFInspector item={item} />, { wrapper });
    const help = screen.getByText(CAMERA_VIEW_TERMS.help);
    const use = screen.getByRole('button', { name: CAMERA_VIEW_TERMS.useCurrent });
    const go = screen.getByRole('button', { name: CAMERA_VIEW_TERMS.goTo });
    expect(help.compareDocumentPosition(use) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(help.compareDocumentPosition(go) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Use current view writes the live map camera into the keyframe', () => {
    render(<CameraKFInspector item={item} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: CAMERA_VIEW_TERMS.useCurrent }));
    const saved = (useProjectStore.getState().items[CAMERA_TRACK_ID] as CameraItem).keyframes[0];
    expect(saved.camera).toMatchObject({ center: [12.5, 41.9], zoom: 13.5, pitch: 50, bearing: 75 });
    expect(saved.time).toBe(2);
  });

  it('Use current view is one undoable step', () => {
    const before = useProjectStore.temporal.getState().pastStates.length;
    render(<CameraKFInspector item={item} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: CAMERA_VIEW_TERMS.useCurrent }));
    expect(useProjectStore.temporal.getState().pastStates.length).toBe(before + 1);
  });

  it('Go to this view moves the map to the keyframe camera', () => {
    render(<CameraKFInspector item={item} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: CAMERA_VIEW_TERMS.goTo }));
    expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [1, 2], zoom: 4, pitch: 10, bearing: 20 }));
  });

  it('Go to this view does not move the map while the project plays', () => {
    useProjectStore.setState({ isPlaying: true });
    render(<CameraKFInspector item={item} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: CAMERA_VIEW_TERMS.goTo }));
    expect(easeTo).not.toHaveBeenCalled();
  });

  it('does nothing when there is no map', () => {
    render(<CameraKFInspector item={item} />);
    fireEvent.click(screen.getByRole('button', { name: CAMERA_VIEW_TERMS.useCurrent }));
    const saved = (useProjectStore.getState().items[CAMERA_TRACK_ID] as CameraItem).keyframes[0];
    expect(saved.camera.zoom).toBe(4);
  });
});

describe('CameraKFInspector exact values', () => {
  it('is closed by default in the config', () => {
    const exact = INSPECTOR_SECTIONS['camera-kf'].find((s) => s.id === 'exact');
    expect(exact?.title).toBe('Exact values');
    expect(exact?.defaultOpen).toBe(false);
  });

  it('hides the number fields until the section opens', () => {
    render(<CameraKFInspector item={item} />, { wrapper });
    expect(screen.queryByText('Longitude')).not.toBeInTheDocument();
    expect(screen.queryByText('Zoom')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exact values' }));
    expect(screen.getByText('Longitude')).toBeInTheDocument();
    expect(screen.getByText('Zoom')).toBeInTheDocument();
    expect(screen.getByText('Pitch')).toBeInTheDocument();
    expect(screen.getByText('Bearing')).toBeInTheDocument();
  });
});

describe('CameraKFInspector words', () => {
  it('names the panel with the camera view term and its time', () => {
    render(<CameraKFInspector item={item} />, { wrapper });
    expect(screen.getByText(new RegExp(`^${ITEM_TYPE_LABELS['camera-kf']} at \\d\\d:\\d\\d\\.\\d\\d$`))).toBeInTheDocument();
  });

  it('asks for a camera view, not a keyframe, when none is selected', () => {
    useProjectStore.setState({ selectedKeyframeId: null });
    render(<CameraKFInspector item={item} />, { wrapper });
    expect(screen.getByText(CAMERA_VIEW_TERMS.selectOne)).toBeInTheDocument();
    expect(screen.getByText('1 camera view')).toBeInTheDocument();
    expect(screen.queryByText(/keyframe/i)).not.toBeInTheDocument();
  });
});
