import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PinDropHero } from './pin-drop';
import { mappoAspect, mappoTipX } from '@/components/Mappo/moods';

describe('<PinDropHero />', () => {
  it('drops Mappo in the given mood onto the map', () => {
    const { container } = render(<PinDropHero mood="phone" />);
    expect(container.querySelector('svg[data-mood="phone"]')).not.toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it("lands the pin's tip on the middle of the hero, whatever the pose's frame", () => {
    const pin = (mood: 'camera' | 'wave') =>
      render(<PinDropHero mood={mood} />).container.querySelector<HTMLElement>('[data-slot="pin-drop-pin"]');
    const width = (mood: 'camera' | 'wave') => 100 * mappoAspect(mood);
    expect(pin('camera')?.style.left).toBe('50%');
    expect(pin('camera')?.style.marginLeft).toBe(`${-mappoTipX('camera') * width('camera')}px`);
    expect(pin('wave')?.style.marginLeft).toBe(`${-mappoTipX('wave') * width('wave')}px`);
  });

  it('moves the map so the spot sits under the pin', () => {
    const map = (spot: 'alcatraz' | 'sausalito') =>
      render(<PinDropHero mood="default" spot={spot} />).container.querySelector<HTMLElement>('[data-slot="pin-drop-map"]');
    expect(map('alcatraz')?.style.getPropertyValue('--spot-x')).toBe('0.559');
    expect(map('sausalito')?.style.getPropertyValue('--spot-x')).toBe('0.3438');
  });

  it('only draws the trip when asked', () => {
    const route = (withRoute: boolean) =>
      render(<PinDropHero mood="camera" route={withRoute} />).container.querySelector('[data-slot="pin-drop-route"]');
    expect(route(false)).toBeNull();
    expect(route(true)).not.toBeNull();
  });

  it('labels the place and credits the map data', () => {
    render(<PinDropHero mood="camera" spot="sausalito" tag="Sausalito" />);
    expect(screen.getByText('Sausalito')).toBeTruthy();
    expect(screen.getByText('© Mapbox © OpenStreetMap')).toBeTruthy();
  });

  it('uses a shorter hero and a smaller pin when compact', () => {
    const { container } = render(<PinDropHero mood="key" size="compact" />);
    const hero = container.querySelector<HTMLElement>('[data-slot="pin-drop"]');
    const pin = container.querySelector<HTMLElement>('[data-slot="pin-drop-pin"]');
    expect(hero?.style.height).toBe('132px');
    expect(pin?.style.height).toBe('76px');
  });

  it('is decoration for assistive tech', () => {
    const { container } = render(<PinDropHero mood="default" />);
    expect(container.querySelector('[data-slot="pin-drop"]')?.getAttribute('aria-hidden')).toBe('true');
  });
});
