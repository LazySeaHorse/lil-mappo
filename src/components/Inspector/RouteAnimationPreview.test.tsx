import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteAnimationPreview } from './RouteAnimationPreview';

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

const originalMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = originalMatchMedia; });

describe('RouteAnimationPreview', () => {
  it.each(['draw', 'navigation', 'comet'] as const)('renders a looping SVG for %s', (type) => {
    setReducedMotion(false);
    const { container } = render(<RouteAnimationPreview type={type} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-motion', 'animated');
    expect(container.querySelector('[data-role="line"]')).toHaveClass(`route-preview-${type}`);
  });

  it.each(['draw', 'navigation', 'comet'] as const)('shows one still frame of %s when the user prefers reduced motion', (type) => {
    setReducedMotion(true);
    const { container } = render(<RouteAnimationPreview type={type} />);
    expect(container.querySelector('svg')).toHaveAttribute('data-motion', 'static');
    const line = container.querySelector('[data-role="line"]')!;
    expect(line.getAttribute('class') ?? '').not.toMatch(/route-preview/);
    expect((line as SVGElement).style.strokeDasharray).not.toBe('');
    expect((line as SVGElement).style.strokeDashoffset).not.toBe('');
  });
});
