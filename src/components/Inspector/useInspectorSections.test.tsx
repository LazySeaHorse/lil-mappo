import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useInspectorSections } from './useInspectorSections';
import { InspectorSection } from './InspectorSection';
import { INSPECTOR_SECTIONS } from './inspectorSections';
import {
  INSPECTOR_SECTIONS_STORAGE_KEY,
  readInspectorSections,
} from '@/store/inspectorSectionsPreference';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';

function reloadPreferences() {
  useUiPreferencesStore.setState({ inspectorSections: readInspectorSections() });
}

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});

describe('INSPECTOR_SECTIONS config', () => {
  it('has unique section ids per panel', () => {
    for (const sections of Object.values(INSPECTOR_SECTIONS)) {
      const ids = sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('useInspectorSections', () => {
  it('starts with each section at its default', () => {
    const { result } = renderHook(() => useInspectorSections('project'));
    expect(result.current.isOpen('env')).toBe(true);
    expect(result.current.isOpen('atmos')).toBe(false);
  });

  it('toggles a section and remembers it in storage', () => {
    const { result } = renderHook(() => useInspectorSections('project'));
    act(() => result.current.toggle('env'));
    act(() => result.current.toggle('atmos'));
    expect(result.current.isOpen('env')).toBe(false);
    expect(result.current.isOpen('atmos')).toBe(true);

    expect(JSON.parse(localStorage.getItem(INSPECTOR_SECTIONS_STORAGE_KEY)!)).toEqual({
      project: { env: false, atmos: true },
    });

    // A fresh page load reads the same choices.
    reloadPreferences();
    const reloaded = renderHook(() => useInspectorSections('project'));
    expect(reloaded.result.current.isOpen('env')).toBe(false);
    expect(reloaded.result.current.isOpen('atmos')).toBe(true);
  });

  it('keeps panels apart', () => {
    const route = renderHook(() => useInspectorSections('route'));
    const callout = renderHook(() => useInspectorSections('callout'));
    act(() => route.result.current.toggle('appearance'));
    expect(route.result.current.isOpen('appearance')).toBe(false);
    expect(callout.result.current.isOpen('appearance')).toBe(true);
  });

  it.each([
    ['not JSON', '{oops'],
    ['wrong shape', JSON.stringify({ route: 'open', callout: { style: 'yes' } })],
    ['an array', '[]'],
  ])('falls back to defaults when storage holds %s', (_name, raw) => {
    localStorage.setItem(INSPECTOR_SECTIONS_STORAGE_KEY, raw);
    reloadPreferences();
    const { result } = renderHook(() => useInspectorSections('route'));
    expect(result.current.isOpen('path')).toBe(true);
    expect(result.current.isOpen('appearance')).toBe(true);
  });

  it('falls back to defaults when storage throws, and still toggles', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    reloadPreferences();
    const { result } = renderHook(() => useInspectorSections('route'));
    expect(result.current.isOpen('path')).toBe(true);
    act(() => result.current.toggle('path'));
    expect(result.current.isOpen('path')).toBe(false);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('InspectorSection', () => {
  it('shows the title from the config and its content when open', () => {
    render(<InspectorSection kind="project" id="env"><p>Inside</p></InspectorSection>);
    const button = screen.getByRole('button', { name: 'Map' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Inside')).toBeInTheDocument();
  });

  it('starts closed when the default is closed', () => {
    render(<InspectorSection kind="project" id="atmos"><p>Inside</p></InspectorSection>);
    expect(screen.getByRole('button', { name: 'Atmosphere' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Inside')).not.toBeInTheDocument();
  });

  it('opens and closes on click and remembers the choice', () => {
    render(<InspectorSection kind="project" id="env"><p>Inside</p></InspectorSection>);
    const button = screen.getByRole('button', { name: 'Map' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Inside')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(INSPECTOR_SECTIONS_STORAGE_KEY)!).project.env).toBe(false);
    fireEvent.click(button);
    expect(screen.getByText('Inside')).toBeInTheDocument();
  });

  it('links the button to its content region', () => {
    render(<InspectorSection kind="project" id="env"><p>Inside</p></InspectorSection>);
    const button = screen.getByRole('button', { name: 'Map' });
    const region = screen.getByRole('region', { name: 'Map' });
    expect(button.getAttribute('aria-controls')).toBe(region.id);
  });
});
