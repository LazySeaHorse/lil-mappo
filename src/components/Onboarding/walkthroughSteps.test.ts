import { describe, expect, it } from 'vitest';
import {
  getWalkthroughStages,
  getWalkthroughStepConfig,
  type VisibleWalkthroughStage,
} from './walkthroughSteps';

describe('walkthrough steps', () => {
  it('is one short trip: map, route, follow, play, more, export', () => {
    expect(getWalkthroughStages(false)).toEqual([
      'map-controls',
      'route',
      'route-places',
      'route-preview',
      'route-insert',
      'follow-route',
      'play-animation',
      'more-tools',
      'render',
    ]);
  });

  it('adds the Add menu step on phones and narrow tablets', () => {
    const stages = getWalkthroughStages(true);
    expect(stages.slice(0, 3)).toEqual(['map-controls', 'open-add-menu', 'route']);
    expect(stages).toHaveLength(getWalkthroughStages(false).length + 1);
  });

  it.each([false, true])('has a titled step with a target for every stage (mobile: %s)', (isMobile) => {
    for (const stage of getWalkthroughStages(isMobile)) {
      const step = getWalkthroughStepConfig(stage, isMobile);
      expect(step.stage).toBe(stage);
      expect(step.title).not.toBe('');
      expect(step.target).toMatch(/^\[data-walkthrough="[a-z-]+"\]$/);
    }
  });

  it('adds camera views, a border, a callout and settings when the user keeps going', () => {
    const extras = ['camera-view-first', 'camera-view-second', 'camera-view-rewind', 'camera-view-play', 'boundary', 'boundary-insert', 'callout', 'callout-insert', 'project-settings'];
    const stages = getWalkthroughStages(false, 'trip+extras');
    expect(stages.slice(7)).toEqual(['more-tools', ...extras, 'render']);
    expect(getWalkthroughStages(false, 'extras')).toEqual([...extras, 'render']);
  });

  it('offers Keep going or Export at the end of the trip', () => {
    const step = getWalkthroughStepConfig('more-tools', false);
    expect(step.nextLabel).toBe('Keep going');
    expect(step.secondaryLabel).toBe('Go to Export');
  });

  it.each([false, true])('has a titled step with a target for every extras stage (mobile: %s)', (isMobile) => {
    for (const stage of getWalkthroughStages(isMobile, 'extras')) {
      const step = getWalkthroughStepConfig(stage, isMobile);
      expect(step.title).not.toBe('');
      expect(step.target).toMatch(/^\[data-walkthrough="[a-z-]+"\]$/);
    }
  });

  it('asks for an action in every step except the ones that only inform', () => {
    const informing = getWalkthroughStages(false).filter((stage) =>
      getWalkthroughStepConfig(stage, false).buttons?.includes('primary'),
    );
    expect(informing).toEqual(['play-animation', 'more-tools']);
  });

  it('teaches Enter, Follow camera and where new items start', () => {
    const text = (stage: VisibleWalkthroughStage) => {
      const step = getWalkthroughStepConfig(stage, false);
      const content = step.renderContent({ isMobile: false, gestures: { pan: false, orbit: false, zoom: false }, routeEndpoints: { start: false, end: false } });
      return JSON.stringify(content);
    };
    expect(text('route-places')).toMatch(/Enter/);
    expect(text('route-insert')).toMatch(/playhead/);
    expect(getWalkthroughStepConfig('follow-route', false).target).toBe('[data-walkthrough="follow-route"]');
    expect(text('follow-route')).toMatch(/Follow camera/);
    expect(text('follow-route')).toMatch(/along the route/);
  });

  it('does not tell people to skip exporting, and has no map style busywork', () => {
    const all = getWalkthroughStages(false).map((stage) => JSON.stringify(getWalkthroughStepConfig(stage, false).renderContent({
      isMobile: false, gestures: { pan: true, orbit: true, zoom: true }, routeEndpoints: { start: true, end: true },
    })));
    expect(all.join(' ')).not.toMatch(/do not need to export/i);
    expect(all.join(' ')).not.toMatch(/Standard style|Satellite/i);
  });
});
