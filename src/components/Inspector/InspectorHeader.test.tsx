import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InspectorHeader } from './InspectorHeader';
import { RouteInspector } from './RouteInspector';
import { BoundaryInspector } from './BoundaryInspector';
import { CameraKFInspector } from './CameraKFInspector';
import { AnnotationInspector } from '@/annotations/inspector/AnnotationInspector';
import { useProjectStore } from '@/store/useProjectStore';
import {
  createBoundaryItem,
  createCalloutItem,
  createCameraKeyframe,
  createEndpointRouteItem,
} from '@/store/itemFactories';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import '@/annotations/styles/index';
import { ITEM_TYPE_LABELS } from '@/lib/terms';
import type { CameraItem } from '@/store/types';

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }),
}));
vi.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false }),
}));
vi.mock('./RoutePlanner', () => ({ RoutePlanner: () => <div /> }));
vi.mock('./BoundarySearch', () => ({ BoundarySearch: () => <div /> }));
vi.mock('../Search/SearchField', () => ({ SearchField: () => <div /> }));

function openMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Item actions' }), { button: 0, ctrlKey: false });
}

const spies = {
  duplicateItem: vi.fn(),
  duplicateCameraKeyframe: vi.fn(),
  removeItem: vi.fn(),
  selectItem: vi.fn(),
  removeCameraKeyframe: vi.fn(),
  selectKeyframe: vi.fn(),
  setPlayheadTime: vi.fn(),
  setIsPlaying: vi.fn(),
};

beforeEach(() => {
  Object.values(spies).forEach((s) => s.mockClear());
  useProjectStore.setState({
    items: {},
    itemOrder: [],
    selectedItemId: null,
    selectedKeyframeId: null,
    ...spies,
  });
});

describe('InspectorHeader', () => {
  it('shows the item name', () => {
    render(<InspectorHeader kind="route" id="r1" name="Road trip" startTime={2} onRename={() => {}} />);
    expect(screen.getByDisplayValue('Road trip')).toBeInTheDocument();
  });

  it.each(['route', 'callout', 'boundary', 'camera-kf'] as const)(
    'shows no type line under the name of a %s, and names the panel for screen readers only',
    (kind) => {
      render(<InspectorHeader kind={kind} id="x" name="Thing" startTime={0} />);
      const heading = screen.getByRole('heading', { name: ITEM_TYPE_LABELS[kind] });
      expect(heading).toHaveClass('sr-only');
    },
  );

  it('sends renames to onRename', () => {
    const onRename = vi.fn();
    render(<InspectorHeader kind="route" id="r1" name="Road trip" startTime={0} onRename={onRename} />);
    fireEvent.change(screen.getByDisplayValue('Road trip'), { target: { value: 'Coast' } });
    expect(onRename).toHaveBeenCalledWith('Coast');
  });

  it('shows a fixed name when the item cannot be renamed', () => {
    render(<InspectorHeader kind="camera-kf" id="k1" name="Keyframe at 00:02.50" startTime={2.5} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Keyframe at 00:02.50')).toBeInTheDocument();
  });

  it('Duplicate calls duplicateItem', () => {
    render(<InspectorHeader kind="route" id="r1" name="A" startTime={0} onRename={() => {}} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(spies.duplicateItem).toHaveBeenCalledWith('r1');
  });

  it('Delete removes the item and clears the selection', () => {
    render(<InspectorHeader kind="callout" id="c1" name="A" startTime={0} onRename={() => {}} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(spies.removeItem).toHaveBeenCalledWith('c1');
    expect(spies.selectItem).toHaveBeenCalledWith(null);
  });

  it('Go to start pauses and moves the playhead to the start time', () => {
    render(<InspectorHeader kind="boundary" id="b1" name="A" startTime={4.5} onRename={() => {}} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Go to start' }));
    expect(spies.setIsPlaying).toHaveBeenCalledWith(false);
    expect(spies.setPlayheadTime).toHaveBeenCalledWith(4.5);
  });

  it('a camera view duplicates the keyframe, not an item', () => {
    render(<InspectorHeader kind="camera-kf" id="k1" name="A" startTime={1} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(spies.duplicateCameraKeyframe).toHaveBeenCalledWith('k1');
    expect(spies.duplicateItem).not.toHaveBeenCalled();
  });

  it('a camera view deletes the keyframe', () => {
    render(<InspectorHeader kind="camera-kf" id="k1" name="A" startTime={1} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(spies.removeCameraKeyframe).toHaveBeenCalledWith('k1');
    expect(spies.selectKeyframe).toHaveBeenCalledWith(null);
    expect(spies.removeItem).not.toHaveBeenCalled();
  });
});

describe('item panels use the header, not a footer', { timeout: 20000 }, () => {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }],
  };

  function expectHeaderOnly(container: HTMLElement) {
    expect(screen.getByRole('button', { name: 'Item actions' })).toBeInTheDocument();
    expect(within(container).queryByRole('button', { name: /^Delete /i })).not.toBeInTheDocument();
    expect(within(container).queryByRole('button', { name: /^Duplicate$/i })).not.toBeInTheDocument();
  }

  it('route', () => {
    const item = createEndpointRouteItem({ mode: 'car', geojson, start: [0, 0], end: [1, 1], name: 'Drive', startTime: 0 });
    useProjectStore.setState({ items: { [item.id]: item } });
    const { container } = render(<RouteInspector item={item} />);
    expectHeaderOnly(container);
    expect(screen.getByText('Route')).toBeInTheDocument();
  });

  it('boundary', () => {
    const item = createBoundaryItem({ placeName: 'Spain', geojson: null, startTime: 0 });
    useProjectStore.setState({ items: { [item.id]: item } });
    const { container } = render(<BoundaryInspector item={item} />);
    expectHeaderOnly(container);
    expect(screen.getByText('Area')).toBeInTheDocument();
  });

  it('callout', () => {
    const item = createCalloutItem({ styleId: 'leader-line', content: { title: 'Pier' }, lngLat: [1, 2], startTime: 0 })!;
    useProjectStore.setState({ items: { [item.id]: item } });
    const { container } = render(<AnnotationInspector item={item} />);
    expectHeaderOnly(container);
    expect(screen.getByText('Callout')).toBeInTheDocument();
  });

  it('camera view', () => {
    const kf = createCameraKeyframe({ time: 2.5, center: [0, 0], zoom: 5 });
    const item: CameraItem = { id: CAMERA_TRACK_ID, kind: 'camera', keyframes: [kf] };
    useProjectStore.setState({ items: { [item.id]: item }, selectedKeyframeId: kf.id });
    const { container } = render(<CameraKFInspector item={item} />);
    expectHeaderOnly(container);
    expect(screen.getByText('Camera view')).toBeInTheDocument();
  });
});
