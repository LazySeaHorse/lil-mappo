import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@/annotations/styles/index';
import { CAMERA_TRACK_ID, createTransientState, useProjectStore } from '@/store/useProjectStore';
import { clearHistory, undo } from '@/store/history';
import type { BoundaryItem, CalloutItem, RouteItem, TimelineItem } from '@/store/types';
import { createCalloutItem } from '@/store/itemFactories';
import InspectorPanel from './InspectorPanel';

vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null }) }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@/annotations/inspector/stylePreview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/annotations/inspector/stylePreview')>()),
  getStylePreview: vi.fn().mockResolvedValue(null),
}));
// The animated previews draw on a canvas; here they only say what they show.
vi.mock('@/annotations/inspector/AnimatedStylePreview', () => ({
  AnimatedStylePreview: ({ styleId }: { styleId: string }) => <div data-testid="animated-preview">{styleId}</div>,
}));

const BLUE = '#3b82f6';

function route(id: string, style: Partial<RouteItem['style']> = {}, rest: Partial<RouteItem> = {}): RouteItem {
  return {
    kind: 'route', id, name: id, geojson: { type: 'FeatureCollection', features: [] }, startTime: 0, endTime: 2,
    style: { color: '#000000', width: 4, glow: false, glowWidth: 8, dashPattern: null, animationType: 'draw', cometTrailLength: 0.2, ...style },
    easing: 'linear', exitAnimation: 'none', ...rest,
  };
}

function setItems(...clips: TimelineItem[]) {
  useProjectStore.setState({
    ...createTransientState(),
    isInspectorOpen: true,
    items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, ...Object.fromEntries(clips.map((clip) => [clip.id, clip])) },
    itemOrder: [CAMERA_TRACK_ID, ...clips.map((clip) => clip.id)],
  });
  clearHistory();
}

function selectAll(...ids: string[]) {
  act(() => {
    useProjectStore.getState().selectItem(ids[0]);
    ids.slice(1).forEach((id) => useProjectStore.getState().toggleItemSelection(id));
  });
}

const stored = <T extends TimelineItem>(id: string) => useProjectStore.getState().items[id] as T;
const section = (name: string) => within(screen.getByRole('region', { name }));

function callout(id: string, styleId: string): CalloutItem {
  return createCalloutItem({ id, styleId, content: { title: id }, lngLat: [0, 0], startTime: 0 })!;
}

beforeEach(() => setItems(route('a'), route('b')));

describe('the inspector with several clips of one kind selected', () => {
  it('names how many there are and offers their shared settings', () => {
    render(<InspectorPanel />);
    selectAll('a', 'b');
    expect(screen.getAllByText('2 routes').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Line' })).toBeInTheDocument();
  });

  it('leaves out what belongs to one clip', () => {
    render(<InspectorPanel />);
    selectAll('a', 'b');
    expect(screen.queryByRole('region', { name: 'Path' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Camera' })).not.toBeInTheDocument();
    expect(section('Timing').queryByText('Start')).not.toBeInTheDocument();
    expect(section('Timing').queryByText('End')).not.toBeInTheDocument();
  });

  it('reads Mixed only where the clips differ', () => {
    setItems(route('a', { width: 2 }), route('b', { width: 9 }));
    render(<InspectorPanel />);
    selectAll('a', 'b');
    expect(section('Line').getAllByText('Mixed')).toHaveLength(1);
    expect(section('Line').queryByText('2 px')).not.toBeInTheDocument();
  });

  it('gives every clip the new value and leaves their other settings alone', () => {
    setItems(route('a', { width: 2 }), route('b', { width: 9 }));
    render(<InspectorPanel />);
    selectAll('a', 'b');

    fireEvent.click(screen.getByRole('button', { name: `Select color ${BLUE}` }));

    expect(stored<RouteItem>('a').style).toMatchObject({ color: BLUE, width: 2 });
    expect(stored<RouteItem>('b').style).toMatchObject({ color: BLUE, width: 9 });
  });

  it('undoes an edit across all the clips in one step', () => {
    render(<InspectorPanel />);
    selectAll('a', 'b');

    fireEvent.click(screen.getByRole('button', { name: `Select color ${BLUE}` }));
    act(() => { undo(); });

    expect(stored<RouteItem>('a').style.color).toBe('#000000');
    expect(stored<RouteItem>('b').style.color).toBe('#000000');
  });

  it('hides a control that depends on a setting the clips differ on', () => {
    setItems(route('a', { glow: true }), route('b', { glow: false }));
    render(<InspectorPanel />);
    selectAll('a', 'b');
    expect(section('Line').getByText('Mixed')).toBeInTheDocument();
    expect(section('Line').queryByText('Glow width')).not.toBeInTheDocument();
  });

  it('marks no line style while the clips differ, and picking one sets them all', () => {
    setItems(route('a', { dashPattern: null }), route('b', { dashPattern: [8, 4] }));
    render(<InspectorPanel />);
    selectAll('a', 'b');

    fireEvent.click(section('Line').getByRole('button', { name: 'Dotted' }));

    expect(stored<RouteItem>('a').style.dashPattern).toEqual([2, 4]);
    expect(stored<RouteItem>('b').style.dashPattern).toEqual([2, 4]);
  });

  it('offers When it ends only if every route has it', () => {
    setItems(route('a', { animationType: 'draw' }), route('b', { animationType: 'comet' }));
    render(<InspectorPanel />);
    selectAll('a', 'b');
    expect(section('Timing').queryByText('When it ends')).not.toBeInTheDocument();
  });

  it('writes When it ends to every route', () => {
    setItems(route('a', {}, { exitAnimation: 'none' }), route('b', {}, { exitAnimation: 'fade' }));
    render(<InspectorPanel />);
    selectAll('a', 'b');
    expect(section('Timing').getByText('Mixed')).toBeInTheDocument();

    fireEvent.click(section('Timing').getByRole('radio', { name: 'Hide' }));

    expect(stored<RouteItem>('a').exitAnimation).toBe('reverse');
    expect(stored<RouteItem>('b').exitAnimation).toBe('reverse');
  });

  it('never picks a flag for several areas at once', () => {
    const area = (id: string): BoundaryItem => ({
      kind: 'boundary', id, placeName: id, geojson: null, startTime: 0, endTime: 2, easing: 'linear', exitAnimation: 'none', source: null,
      style: {
        strokeColor: '#000000', strokeWidth: 2, glow: false, fillMode: 'flag', fillColor: '#000000', fillOpacity: 0.5, fillUnderRoads: false,
        flagCode: id, maskOutside: false, maskColor: '#000000', maskOpacity: 0.5, animateStroke: false, animationStyle: 'fade', traceLength: 0.1,
      } as BoundaryItem['style'],
    });
    setItems(area('fr'), area('de'));
    render(<InspectorPanel />);
    selectAll('fr', 'de');

    expect(screen.getAllByText('2 areas').length).toBeGreaterThan(0);
    expect(screen.queryByText('Select a country to show its flag inside the boundary.')).not.toBeInTheDocument();
    expect(section('Appearance').queryByText('Fill color')).not.toBeInTheDocument();
  });

  it('shows a style\'s own controls only when every callout has that style', () => {
    setItems(callout('c1', 'highlight-tag'), callout('c2', 'highlight-tag'), callout('c3', 'big-number'));
    render(<InspectorPanel />);

    selectAll('c1', 'c2');
    expect(screen.getByRole('region', { name: 'Appearance' })).toBeInTheDocument();

    selectAll('c1', 'c3');
    expect(screen.queryByRole('region', { name: 'Appearance' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Size' })).toBeInTheDocument();
  });
});

describe('changing the style of several callouts', () => {
  const useStyle = (name: string) => {
    fireEvent.click(section('Style').getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('option', { name }));
    fireEvent.click(screen.getByRole('button', { name: 'Use style' }));
  };

  it('reads Mixed while the styles differ, with no current style in the dialog', () => {
    setItems(callout('c1', 'leader-line'), callout('c2', 'waypoint'));
    render(<InspectorPanel />);
    selectAll('c1', 'c2');

    expect(section('Style').getByText('Mixed')).toBeInTheDocument();
    fireEvent.click(section('Style').getByRole('button', { name: 'Change' }));
    expect(screen.queryByText('In use')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('animated-preview')).toHaveLength(1);
  });

  it('can give them all the style one of them already has, leaving that one untouched', () => {
    setItems(callout('c1', 'leader-line'), callout('c2', 'waypoint'));
    render(<InspectorPanel />);
    selectAll('c1', 'c2');
    const alreadyThere = stored<CalloutItem>('c2');

    useStyle('Waypoint');

    expect(stored<CalloutItem>('c1').styleId).toBe('waypoint');
    expect(stored<CalloutItem>('c2')).toBe(alreadyThere);
  });

  it('keeps each callout\'s own text and offers the style\'s controls afterwards', () => {
    setItems(callout('c1', 'leader-line'), callout('c2', 'highlight-tag'));
    render(<InspectorPanel />);
    selectAll('c1', 'c2');

    useStyle('Waypoint');

    expect(stored<CalloutItem>('c1').content.title).toBe('c1');
    expect(stored<CalloutItem>('c2').content.title).toBe('c2');
    expect(section('Style').queryByText('Mixed')).not.toBeInTheDocument();
    expect(section('Style').getByText('Waypoint')).toBeInTheDocument();
  });

  it('undoes the change on all of them in one step', () => {
    setItems(callout('c1', 'leader-line'), callout('c2', 'highlight-tag'));
    render(<InspectorPanel />);
    selectAll('c1', 'c2');

    useStyle('Waypoint');
    act(() => { undo(); });

    expect(stored<CalloutItem>('c1').styleId).toBe('leader-line');
    expect(stored<CalloutItem>('c2').styleId).toBe('highlight-tag');
  });
});

describe('the inspector with clips of different kinds selected', () => {
  it('says so instead of offering settings', () => {
    setItems(route('a'), callout('c', 'highlight-tag'));
    render(<InspectorPanel />);
    selectAll('a', 'c');
    expect(screen.getAllByText('2 items selected').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});

describe('going back to one clip', () => {
  it('shows that clip again once only one is selected', () => {
    render(<InspectorPanel />);
    act(() => {
      useProjectStore.getState().selectItem('a');
      useProjectStore.getState().toggleItemSelection('b');
      useProjectStore.getState().toggleItemSelection('b');
    });
    expect(screen.queryByText('2 routes')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Path' })).toBeInTheDocument();
  });
});
