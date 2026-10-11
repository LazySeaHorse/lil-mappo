import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/useAuthStore';
import { creditsToMinutesAt1080p } from '@/services/checkout';
import { UpgradeModal } from './UpgradeModal';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null }) }));

describe('UpgradeModal', () => {
  it('shows the free-plan limits', () => {
    useAuthStore.setState({ showUpgradeModal: true });
    render(<UpgradeModal />);

    expect(screen.getByText('3 projects')).toBeInTheDocument();
    expect(screen.getByText('720p, 30 FPS')).toBeInTheDocument();
    expect(screen.getByText('30 seconds')).toBeInTheDocument();
  });
});

describe('creditsToMinutesAt1080p', () => {
  it('quotes 8 credits per minute of 1080p video', () => {
    expect(creditsToMinutesAt1080p(1000)).toBe(125);
  });
});
