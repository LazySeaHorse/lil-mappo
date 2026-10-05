import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Mappo } from './Mappo';
import { accountMood } from './moods';
import type { MappoMood } from './moods';
import type { Subscription } from '@/lib/database.types';

const wanderer = { tier: 'wanderer', status: 'active', renewal_date: null } as unknown as Subscription;

describe('accountMood', () => {
  it('keeps the default face for guests', () => {
    expect(accountMood({ signedIn: false, subscription: null })).toBe('default');
  });
  it('blushes for signed-in free users', () => {
    expect(accountMood({ signedIn: true, subscription: null })).toBe('blush');
  });
  it('wears the explorer cap for paid users', () => {
    expect(accountMood({ signedIn: true, subscription: wanderer })).toBe('explorer');
  });
  it('does not give a signed-out user the cap even with a stale subscription', () => {
    expect(accountMood({ signedIn: false, subscription: wanderer })).toBe('default');
  });
});

describe('<Mappo />', () => {
  const moods: MappoMood[] = ['default', 'sleepy', 'inquisitive', 'curious', 'happy', 'blush', 'sparkle', 'worried', 'explorer'];

  it.each(moods)('renders the %s mood', (mood) => {
    const { container } = render(<Mappo mood={mood} />);
    expect(container.querySelector('svg')?.getAttribute('data-mood')).toBe(mood);
  });

  it('only the explorer wears a cap', () => {
    const cap = (mood: MappoMood) => render(<Mappo mood={mood} />).container.querySelectorAll('g').length;
    expect(cap('explorer')).toBeGreaterThan(cap('blush'));
  });

  it('is hidden from assistive tech unless titled', () => {
    expect(render(<Mappo />).container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(render(<Mappo title="Mappo" />).getByRole('img', { name: 'Mappo' })).toBeTruthy();
  });
});
