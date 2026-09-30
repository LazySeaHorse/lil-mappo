import { describe, expect, it } from 'vitest';
import '@/annotations/styles';
import { buildGuide } from './guide';

describe('buildGuide', () => {
  it('mentions the coordinate eyebrow only on styles that fall back to it', () => {
    const lines = buildGuide().split('\n');
    const line = (id: string) => lines.find((l) => l.startsWith(`- ${id}:`))!;
    expect(line('target-lock')).toContain('empty eyebrow shows');
    expect(line('editorial')).not.toContain('empty eyebrow shows');
  });
});
