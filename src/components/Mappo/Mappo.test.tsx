import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Mappo } from './Mappo';
import { accountMood, authMood, mappoTipX } from './moods';
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
  const moods: MappoMood[] = ['default', 'sleepy', 'inquisitive', 'curious', 'happy', 'blush', 'sparkle', 'worried', 'explorer', 'key'];
  const poses: MappoMood[] = ['phone', 'camera', 'map', 'wave', 'cheer', 'reel', 'tangled', 'ticket', 'balloon', 'peek', 'peek-worried', 'nervous', 'cube', 'plug'];
  const viewBox = (mood: MappoMood) => render(<Mappo mood={mood} />).container.querySelector('svg')?.getAttribute('viewBox');

  it.each([...moods, ...poses])('renders the %s mood', (mood) => {
    const { container } = render(<Mappo mood={mood} />);
    expect(container.querySelector('svg')?.getAttribute('data-mood')).toBe(mood);
  });

  it('only the explorer wears a cap', () => {
    const cap = (mood: MappoMood) => render(<Mappo mood={mood} />).container.querySelectorAll('g').length;
    expect(cap('explorer')).toBeGreaterThan(cap('blush'));
  });

  it('widens the frame so the key held out to the right shows', () => {
    expect(viewBox('key')).toBe('351 287 760 678');
    expect(viewBox('blush')).toBe('351 287 553 678');
  });

  it.each(['phone', 'camera', 'wave', 'cheer', 'reel', 'ticket', 'balloon', 'cube', 'plug'] as MappoMood[])(
    'widens the frame so the %s prop shows',
    (mood) => {
      expect(viewBox(mood)).not.toBe('351 287 553 678');
    },
  );

  it('keeps the usual frame for poses that stay inside the pin', () => {
    for (const mood of ['map', 'tangled', 'peek', 'peek-worried', 'nervous'] as MappoMood[]) {
      expect(viewBox(mood)).toBe('351 287 553 678');
    }
  });

  it('knows where the tip sits so a pin can land on a spot', () => {
    expect(mappoTipX('default')).toBeCloseTo((618 - 351) / 553);
    expect(mappoTipX('wave')).toBeCloseTo((618 - 211) / 693);
  });

  it('leans the pin for poses with a lean, pivoting on its tip', () => {
    const lean = (mood: MappoMood) => render(<Mappo mood={mood} />).container.querySelector('svg > g[transform^="rotate("]');
    expect(lean('nervous')?.getAttribute('transform')).toBe('rotate(-5 628 940)');
    expect(lean('curious')).toBeNull();
  });

  it('gives the moving props their own parts so a page can animate them', () => {
    const part = (mood: MappoMood, name: string) => render(<Mappo mood={mood} />).container.querySelector(`[data-part="${name}"]`);
    expect(part('wave', 'arm')).not.toBeNull();
    expect(part('reel', 'reel')).not.toBeNull();
    expect(part('balloon', 'balloon')).not.toBeNull();
    expect(part('cube', 'cube')).not.toBeNull();
    expect(part('plug', 'plug')).not.toBeNull();
    expect(part('cheer', 'confetti')).not.toBeNull();
  });

  it('only moves its parts when animated', () => {
    const svg = (animated?: boolean) => render(<Mappo mood="reel" animated={animated} />).container.querySelector('svg');
    expect(svg()?.classList.contains('mappo-animated')).toBe(false);
    expect(svg(true)?.classList.contains('mappo-animated')).toBe(true);
  });

  it('is hidden from assistive tech unless titled', () => {
    expect(render(<Mappo />).container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(render(<Mappo title="Mappo" />).getByRole('img', { name: 'Mappo' })).toBeTruthy();
  });
});

describe('authMood', () => {
  const base = { isSignup: false, email: '', password: '', phase: 'editing' as const };

  it('sign-in warms up from inquisitive through email and password', () => {
    expect(authMood(base)).toBe('inquisitive');
    expect(authMood({ ...base, email: 'a' })).toBe('inquisitive');
    expect(authMood({ ...base, email: 'a@b.co' })).toBe('curious');
    expect(authMood({ ...base, email: 'a@b.co', password: 'x' })).toBe('happy');
  });

  it('sign-up starts curious and ends sparkly', () => {
    const up = { ...base, isSignup: true };
    expect(authMood(up)).toBe('curious');
    expect(authMood({ ...up, email: 'a@b.co' })).toBe('happy');
    expect(authMood({ ...up, email: 'a@b.co', password: 'x' })).toBe('sparkle');
  });

  it('lands on the signed-in face on success and winces on error', () => {
    expect(authMood({ ...base, phase: 'success' })).toBe('blush');
    expect(authMood({ ...base, isSignup: true, phase: 'success' })).toBe('blush');
    expect(authMood({ ...base, email: 'a@b.co', password: 'x', phase: 'error' })).toBe('worried');
  });

  it('waits happily while submitting and while the confirmation email is out', () => {
    expect(authMood({ ...base, phase: 'submitting' })).toBe('happy');
    expect(authMood({ ...base, phase: 'confirm_email' })).toBe('curious');
  });
});
