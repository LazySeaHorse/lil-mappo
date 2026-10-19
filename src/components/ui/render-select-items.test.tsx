import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select, SelectContent } from './select';
import { FpsSelectItems, ResolutionSelectItems } from './render-select-items';
import type { ExportLimits } from '@/lib/cloudAccess';

const free: ExportLimits = { limited: true, maxResolution: '720p', maxFps: 30, maxDuration: 30 };

function open(children: React.ReactNode) {
  return render(
    <Select open value="720p">
      <SelectContent>{children}</SelectContent>
    </Select>,
  );
}

describe('render select items', () => {
  it('keeps Pro options out of reach by default', () => {
    open(<ResolutionSelectItems limits={free} />);
    expect(screen.getByRole('option', { name: /4K 2160p/ }).getAttribute('aria-disabled')).toBe('true');
  });

  it('lets Pro options be picked, still badged, where picking one offers the upgrade', () => {
    open(
      <>
        <ResolutionSelectItems limits={free} lockedSelectable />
        <FpsSelectItems limits={free} lockedSelectable />
      </>,
    );
    const fourK = screen.getByRole('option', { name: /4K 2160p/ });
    expect(fourK.getAttribute('aria-disabled')).toBeNull();
    expect(fourK.textContent).toContain('PRO');
    expect(screen.getByRole('option', { name: /^60/ }).getAttribute('aria-disabled')).toBeNull();
  });
});
