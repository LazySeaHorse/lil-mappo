import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PinDropHero } from './pin-drop';
import { mappoAspect, mappoTipX } from '@/components/Mappo/moods';

describe('<PinDropHero />', () => {
  it('drops Mappo in the given mood onto a drawn scene, with no map imagery', () => {
    const { container } = render(<PinDropHero mood="phone" scene="mobile" />);
    expect(container.querySelector('svg[data-mood="phone"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="pin-drop"]')?.getAttribute('data-scene')).toBe('mobile');
    expect(container.querySelector('img')).toBeNull();
  });

  it("lands the pin's tip on the middle of the hero, whatever the pose's frame", () => {
    const pin = (mood: 'camera' | 'wave') =>
      render(<PinDropHero mood={mood} scene="tour" />).container.querySelector<HTMLElement>('[data-slot="pin-drop-pin"]');
    const width = (mood: 'camera' | 'wave') => 100 * mappoAspect(mood);
    expect(pin('camera')?.style.left).toBe('50%');
    expect(pin('camera')?.style.marginLeft).toBe(`${-mappoTipX('camera') * width('camera')}px`);
    expect(pin('wave')?.style.marginLeft).toBe(`${-mappoTipX('wave') * width('wave')}px`);
  });

  it("keeps the scene's landing spot under the tip when compact", () => {
    const scene = (size: 'tall' | 'compact') =>
      render(<PinDropHero mood="key" scene="upgrade" size={size} />).container.querySelector('[data-slot="pin-drop-scene"]');
    expect(scene('tall')?.getAttribute('viewBox')).toBe('0 0 760 196');
    // The tip is drawn at y 150 and lands 108px down a 132px hero.
    expect(scene('compact')?.getAttribute('viewBox')).toBe('0 42 760 132');
  });

  it('uses a shorter hero and a smaller pin when compact', () => {
    const { container } = render(<PinDropHero mood="key" scene="upgrade" size="compact" />);
    expect(container.querySelector<HTMLElement>('[data-slot="pin-drop"]')?.style.height).toBe('132px');
    expect(container.querySelector<HTMLElement>('[data-slot="pin-drop-pin"]')?.style.height).toBe('76px');
  });

  it('can label the scene', () => {
    render(<PinDropHero mood="phone" scene="mobile" tag="You are here" />);
    expect(screen.getByText('You are here')).toBeTruthy();
  });

  it('is decoration for assistive tech', () => {
    const { container } = render(<PinDropHero mood="default" scene="library" />);
    expect(container.querySelector('[data-slot="pin-drop"]')?.getAttribute('aria-hidden')).toBe('true');
  });
});
