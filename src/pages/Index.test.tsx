import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { RouteDeepLinkRequest } from '@/services/routeDeepLink';
import Index from './Index';

const editor = vi.hoisted(() => ({ mounts: 0, requests: [] as unknown[] }));

vi.mock('@/components/RenderMode/HeadlessRenderer', () => ({ HeadlessRenderer: () => null }));
vi.mock('@/components/MapStudioEditor', () => ({
  default: function FakeEditor({
    routeDeepLink,
    onRouteDeepLinkSettled,
  }: {
    routeDeepLink: RouteDeepLinkRequest | null;
    onRouteDeepLinkSettled: () => void;
  }) {
    editor.requests.push(routeDeepLink);
    useEffect(() => {
      editor.mounts += 1;
      onRouteDeepLinkSettled();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div>editor</div>;
  },
}));

function Where() {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname + search}</div>;
}

function renderAt(url: string) {
  editor.mounts = 0;
  editor.requests = [];
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/routes/:slug" element={<Index />} />
        <Route path="*" element={<div>not found</div>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

describe('Index route handling', () => {
  it('passes the slug and autocam preset to the editor, then replaces the URL without remounting', async () => {
    renderAt('/routes/jfk-to-lhr?autocam=drone&utm_source=seo');
    expect(await screen.findByText('editor')).toBeInTheDocument();

    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
    expect(editor.mounts).toBe(1);
    // Every render, including after the URL change, sees the captured request.
    expect(editor.requests.every((r) => JSON.stringify(r) === JSON.stringify({ slug: 'jfk-to-lhr', autocam: 'drone' }))).toBe(true);
  });

  it('defaults to the chase preset and ignores unknown query params', () => {
    renderAt('/routes/jfk-to-lhr?foo=bar');
    expect(editor.requests[0]).toEqual({ slug: 'jfk-to-lhr', autocam: 'chase' });
  });

  it('opens the plain editor at / with no deep link', () => {
    renderAt('/');
    expect(editor.requests[0]).toBeNull();
  });

  it('keeps unknown paths on the not-found route', () => {
    renderAt('/routes/jfk-to-lhr/extra');
    expect(screen.getByText('not found')).toBeInTheDocument();
  });
});
