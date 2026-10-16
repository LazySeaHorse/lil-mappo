import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FreeLimitNotice } from './FreeLimitNotice';
import { FREE_LIMITS } from '@/lib/cloudAccess';

describe('FreeLimitNotice', () => {
  it('says exactly what the free plan caps, from the limits', () => {
    render(<FreeLimitNotice limits={FREE_LIMITS} onUpgrade={() => {}} />);
    const text = screen.getByText(/Free exports max out/).textContent;
    expect(text).toContain(FREE_LIMITS.maxResolution);
    expect(text).toContain(`${FREE_LIMITS.maxFps} FPS`);
    expect(text).toContain(`${FREE_LIMITS.maxDuration} s`);
  });

  it('opens the upgrade from the button', () => {
    const onUpgrade = vi.fn();
    render(<FreeLimitNotice limits={FREE_LIMITS} onUpgrade={onUpgrade} />);
    fireEvent.click(screen.getByRole('button', { name: /Unlock 4K and 60 FPS/ }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('shows Mappo holding the key', () => {
    const { container } = render(<FreeLimitNotice limits={FREE_LIMITS} onUpgrade={() => {}} />);
    expect(container.querySelector('svg[data-mood="key"]')).not.toBeNull();
  });
});
