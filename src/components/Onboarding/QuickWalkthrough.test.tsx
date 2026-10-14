import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import QuickWalkthrough from './QuickWalkthrough';
import { useWalkthroughStore, MOBILE_WARNING_STORAGE_KEY } from './useWalkthroughStore';
import { useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { createTransientState } from '@/store/slices/mapEnvironmentSlice';

describe('QuickWalkthrough Component UI', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200,
    });
    useProjectStore.setState({
      ...createProject(),
      ...createTransientState(),
    });
    useWalkthroughStore.setState({
      isRunning: false,
      showInvitation: false,
      showMobileWarning: false,
    });
  });

  afterEach(() => {
    useWalkthroughStore.getState().dismiss();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('shows tour invitation modal on initial load when map is ready and mobile warning already dismissed', () => {
    vi.useFakeTimers();
    localStorage.setItem(MOBILE_WARNING_STORAGE_KEY, 'dismissed');

    render(
      <QuickWalkthrough
        isMapReady={true}
        isMobile={false}
      />,
    );

    expect(useWalkthroughStore.getState().showInvitation).toBe(false);

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(useWalkthroughStore.getState().showInvitation).toBe(true);
  });

  it('shows mobile warning modal first on small screens if not dismissed', () => {
    vi.useFakeTimers();

    render(
      <QuickWalkthrough
        isMapReady={true}
        isMobile={true}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(useWalkthroughStore.getState().showMobileWarning).toBe(true);
  });

  it('starts the tour when user accepts the invitation modal', () => {
    render(
      <QuickWalkthrough
        isMapReady={true}
        isMobile={false}
      />,
    );

    act(() => {
      useWalkthroughStore.getState().setShowInvitation(true);
    });

    const startButton = screen.getByRole('button', { name: /start/i });
    expect(startButton).toBeInTheDocument();

    act(() => {
      fireEvent.click(startButton);
    });

    expect(useWalkthroughStore.getState().isRunning).toBe(true);
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('map-controls');
  });

  it('renders coachmark overlay when walkthrough is running and target element is mounted', () => {
    const anchor = document.createElement('div');
    anchor.setAttribute('data-walkthrough', 'map-coachmark-anchor');
    document.body.appendChild(anchor);

    render(
      <QuickWalkthrough
        isMapReady={true}
        isMobile={false}
      />,
    );

    act(() => {
      useWalkthroughStore.getState().start(false);
    });

    expect(useWalkthroughStore.getState().isRunning).toBe(true);
    expect(screen.getByText(/Learn the map controls/i)).toBeInTheDocument();

    document.body.removeChild(anchor);
  });

  it('invites the user to make a first trip video, with an honest time estimate', () => {
    render(<QuickWalkthrough isMapReady={true} isMobile={false} />);
    act(() => {
      useWalkthroughStore.getState().setShowInvitation(true);
    });

    expect(screen.getByText('Make your first trip video')).toBeInTheDocument();
    expect(screen.getByText(/about 3 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/plan a route between two places/i, { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText(/90 seconds/)).not.toBeInTheDocument();
  });

  describe('route steps', () => {
    const targets: HTMLElement[] = [];
    const addTarget = (name: string) => {
      const el = document.createElement('div');
      el.setAttribute('data-walkthrough', name);
      document.body.appendChild(el);
      targets.push(el);
      return el;
    };
    const goTo = (stage: 'route-places' | 'follow-route') => {
      useWalkthroughStore.getState().start(false);
      act(() => {
        useWalkthroughStore.setState({
          walkthrough: { ...useWalkthroughStore.getState().walkthrough, stage },
        });
      });
    };

    afterEach(() => {
      targets.splice(0).forEach((el) => el.remove());
    });

    it('shows a checklist for the start and end places, and teaches Enter', () => {
      addTarget('route-places');
      render(<QuickWalkthrough isMapReady={true} isMobile={false} />);
      goTo('route-places');

      expect(screen.getByText('Pick a start and an end place')).toBeInTheDocument();
      expect(screen.getByText(/Start: type a place, press Enter, then pick a result/)).toBeInTheDocument();
      expect(screen.getByText(/End: do the same for the end place/)).toBeInTheDocument();
      expect(screen.getByText('Action required')).toBeInTheDocument();
    });

    it('scrolls the Follow camera switch into view and says the camera moves along the route', () => {
      const target = addTarget('follow-route');
      target.scrollIntoView = vi.fn();
      render(<QuickWalkthrough isMapReady={true} isMobile={false} />);
      goTo('follow-route');

      expect(screen.getByText('Make the camera follow the route')).toBeInTheDocument();
      expect(screen.getByText(/the camera moves along the route/)).toBeInTheDocument();
      expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    });
  });
});

