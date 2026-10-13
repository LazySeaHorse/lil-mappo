import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/useAuthStore';
import { AvatarMenu } from './AvatarMenu';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null }) }));

function openMenu() {
  render(<AvatarMenu onLibrary={vi.fn()} onImportProjectClick={vi.fn()} onWalkthrough={vi.fn()} />);
  fireEvent.pointerDown(screen.getByTitle("li'l Mappo menu"), { button: 0, ctrlKey: false });
}

describe('<AvatarMenu />', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('says the work is saved on this device, so guests know it is not lost', async () => {
    openMenu();
    expect(await screen.findByText('Saved on this device')).toBeInTheDocument();
  });

  it.each([
    ['Save to Library', 'Sign in to save projects to your library.'],
    ['Projects', 'Sign in to open your project library.'],
    ['Export Project File', 'Sign in to export a project file.'],
    ['Import Project File', 'Sign in to import a project file.'],
  ])('tells guests why %s is locked', async (name, hint) => {
    openMenu();
    const item = await screen.findByRole('menuitem', { name: new RegExp(name) });
    expect(item).toHaveAttribute('title', hint);
  });

  it('does not lock anything for a signed-in user', async () => {
    useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c' } as never });
    openMenu();
    const item = await screen.findByRole('menuitem', { name: /Save to Library/ });
    expect(item).not.toHaveAttribute('title');
  });
});
