import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { ProjectSettings } from './ProjectSettings';
import { MAP_SETTING_HINTS } from '@/lib/terms';
import { STANDARD_CAPABILITIES } from '@/config/mapbox';
import { readInfoTips } from '@/test/infoTips';

const plan = vi.hoisted(() => ({ data: { tier: 'cartographer' } as { tier: string; status?: string } | null }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: plan.data }) }));

const initialStore = useProjectStore.getState();

beforeEach(() => {
  act(() => useProjectStore.setState(initialStore, true));
  // Section choices are remembered, so each test starts from the defaults.
  act(() => useUiPreferencesStore.setState({ inspectorSections: {} }));
});

/** The Atmosphere section starts collapsed. */
function openAtmosphere() {
  fireEvent.click(screen.getByText('Atmosphere'));
}

describe('ProjectSettings atmosphere', () => {
  it('offers star intensity and fog color on the globe', () => {
    act(() => useProjectStore.getState().setProjection('globe'));
    render(<ProjectSettings />);
    openAtmosphere();
    expect(screen.getByText(/^Star intensity/)).toBeInTheDocument();
    expect(screen.getByText('Fog color')).toBeInTheDocument();
  });

  it('hides star intensity in Mercator, which draws no stars, but keeps the fog color that tints the haze', () => {
    act(() => useProjectStore.getState().setProjection('mercator'));
    render(<ProjectSettings />);
    openAtmosphere();
    expect(screen.queryByText(/^Star intensity/)).toBeNull();
    expect(screen.getByText('Fog color')).toBeInTheDocument();
  });

  it('follows the projection while the panel is open, and keeps the stored star intensity', () => {
    act(() => useProjectStore.setState({ starIntensity: 0.9 }));
    render(<ProjectSettings />);
    openAtmosphere();
    act(() => useProjectStore.getState().setProjection('mercator'));
    expect(screen.queryByText(/^Star intensity/)).toBeNull();
    act(() => useProjectStore.getState().setProjection('globe'));
    expect(screen.getByText(/^Star intensity/)).toBeInTheDocument();
    expect(useProjectStore.getState().starIntensity).toBe(0.9);
  });

  it.each([
    ['satellite', 'day', '#5d7883'],
    ['dark', 'day', '#171717'],
    ['standard', 'day', '#bad2eb'],
    ['standard', 'night', '#171717'],
  ] as const)('defaults the fog color to the fog %s renders (%s)', (mapStyle, lightPreset, rendered) => {
    act(() => useProjectStore.setState({ mapStyle, lightPreset, fogColor: null }));
    render(<ProjectSettings />);
    openAtmosphere();
    expect(screen.getByLabelText(`Custom color ${rendered}`)).toBeInTheDocument();
  });

  it('shows the override once the user picks a fog color', () => {
    act(() => useProjectStore.setState({ mapStyle: 'satellite', fogColor: '#123456' }));
    render(<ProjectSettings />);
    openAtmosphere();
    expect(screen.getByLabelText('Custom color #123456')).toBeInTheDocument();
  });
});

describe('ProjectSettings map hints', () => {
  beforeEach(() => {
    act(() => useProjectStore.setState({
      mapStyle: 'standard',
      projection: 'globe',
      detectedCapabilities: { ...STANDARD_CAPABILITIES, timeOfDayPreset: true, landmarks3d: true, trees3d: true, facades3d: true },
    }));
  });

  it('explains projection, lighting and terrain height in (i) tips in the Map section', async () => {
    render(<ProjectSettings />);
    for (const hint of [MAP_SETTING_HINTS.projection, MAP_SETTING_HINTS.lighting, MAP_SETTING_HINTS.terrainHeight]) {
      expect(screen.queryByText(hint)).toBeNull();
    }
    const tips = await readInfoTips(screen.getByRole('region', { name: 'Map' }));
    expect(tips).toEqual([MAP_SETTING_HINTS.projection, MAP_SETTING_HINTS.lighting, MAP_SETTING_HINTS.terrainHeight]);
  });

  it('labels the ends of the terrain slider', () => {
    render(<ProjectSettings />);
    expect(screen.getByText('Natural')).toBeInTheDocument();
    expect(screen.getByText('Dramatic')).toBeInTheDocument();
  });

  it('explains stars and fog color in (i) tips in the Atmosphere section', async () => {
    render(<ProjectSettings />);
    openAtmosphere();
    expect(screen.queryByText(MAP_SETTING_HINTS.stars)).toBeNull();
    const tips = await readInfoTips(screen.getByRole('region', { name: 'Atmosphere' }));
    expect(tips).toEqual([MAP_SETTING_HINTS.stars, MAP_SETTING_HINTS.fogColor]);
  });

  it('explains each 3D feature in an (i) tip, and where to turn buildings on in a tip on the section title', async () => {
    render(<ProjectSettings />);
    for (const hint of [MAP_SETTING_HINTS.features3d, MAP_SETTING_HINTS.landmarks, MAP_SETTING_HINTS.trees, MAP_SETTING_HINTS.facades]) {
      expect(screen.queryByText(hint)).toBeNull();
    }
    const heading = screen.getByRole('button', { name: '3D features' }).closest('h3')!;
    expect(await readInfoTips(heading)).toEqual([MAP_SETTING_HINTS.features3d]);
    const tips = await readInfoTips(screen.getByRole('region', { name: '3D features' }));
    expect(tips).toEqual([MAP_SETTING_HINTS.landmarks, MAP_SETTING_HINTS.trees, MAP_SETTING_HINTS.facades]);
  });

  it('shows no star tip on the flat map, where there are no stars', async () => {
    act(() => useProjectStore.getState().setProjection('mercator'));
    render(<ProjectSettings />);
    openAtmosphere();
    const tips = await readInfoTips(screen.getByRole('region', { name: 'Atmosphere' }));
    expect(tips).toEqual([MAP_SETTING_HINTS.fogColor]);
  });
});

describe('ProjectSettings is one screen', () => {
  it('has no General / Map tab control', () => {
    render(<ProjectSettings />);
    expect(screen.queryByRole('radio', { name: 'General' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Map' })).toBeNull();
    expect(screen.queryByText('General')).toBeNull();
    expect(document.querySelector('[data-walkthrough="project-settings-map-tab"]')).toBeNull();
  });

  it('shows the video settings in a Video section', () => {
    render(<ProjectSettings />);
    const video = within(screen.getByRole('region', { name: 'Video' }));
    expect(video.getByText('Name')).toBeInTheDocument();
    expect(video.getByLabelText('Duration (s)')).toBeInTheDocument();
    for (const label of ['Frame rate', 'Aspect ratio', 'Orientation', 'Resolution']) {
      expect(video.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows the video settings first and the map sections after them, with no tab to click', () => {
    render(<ProjectSettings />);
    const video = screen.getByRole('region', { name: 'Video' });
    const map = screen.getByRole('region', { name: 'Map' });
    expect(within(map).getByText('Projection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atmosphere' })).toBeInTheDocument();
    expect(video.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the free plan note in the Video section, and only on a free plan', () => {
    plan.data = { tier: 'wanderer', status: 'active' };
    try {
      const { unmount } = render(<ProjectSettings />);
      expect(screen.queryByText(/Free plan limit/)).toBeNull();
      unmount();
      plan.data = null;
      render(<ProjectSettings />);
      expect(within(screen.getByRole('region', { name: 'Video' })).getByText(/Free plan limit/)).toBeInTheDocument();
    } finally {
      plan.data = { tier: 'cartographer' };
    }
  });

  it('ignores an old projectSettingsTab value left in the state', () => {
    act(() => useProjectStore.setState({ projectSettingsTab: 'map' } as never));
    render(<ProjectSettings />);
    expect(screen.getByRole('region', { name: 'Video' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Map' })).toBeInTheDocument();
  });

  it('marks the Map section so the toolbar can scroll to it', () => {
    render(<ProjectSettings />);
    expect(document.querySelector('[data-section="project-env"]')).not.toBeNull();
  });
});
