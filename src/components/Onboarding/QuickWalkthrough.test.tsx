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
        isTablet={false}
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
        isTablet={false}
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
        isTablet={false}
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
        isTablet={false}
      />,
    );

    act(() => {
      useWalkthroughStore.getState().start(false, 0, false);
    });

    expect(useWalkthroughStore.getState().isRunning).toBe(true);
    expect(screen.getByText(/Learn the map controls/i)).toBeInTheDocument();

    document.body.removeChild(anchor);
  });
});
