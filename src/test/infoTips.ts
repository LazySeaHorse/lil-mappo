import { fireEvent, screen, within } from '@testing-library/react';

/**
 * The hint texts of the (i) tips inside `scope` (the whole document by default).
 * It focuses each tip in turn, reads the tooltip and blurs the tip again.
 */
export async function readInfoTips(scope: HTMLElement = document.body): Promise<string[]> {
  const texts: string[] = [];
  for (const tip of within(scope).queryAllByRole('button', { name: 'More info' })) {
    fireEvent.focus(tip);
    texts.push((await screen.findByRole('tooltip')).textContent ?? '');
    fireEvent.blur(tip);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return texts;
}
