import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useProjectStore } from '@/store/useProjectStore';
import { toProjectDocument } from '@/store/projectDocument';
import type { ExportPlan } from '../exportPlan';

function getErrorMessage(error: unknown, fallback = 'Failed to submit cloud render'): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCloudRenderDispatch(
  session: Session | null,
  exportPlan: ExportPlan,
  canAfford: boolean,
  onOpenAuth: () => void,
  onOpenCredits: () => void
) {
  const [cloudSubmitted, setCloudSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCloudRender = async () => {
    if (!session) {
      onOpenAuth();
      return;
    }
    if (!canAfford) {
      onOpenCredits();
      return;
    }

    setError(null);
    setCloudSubmitted(false);

    const store = useProjectStore.getState();
    const renderConfig = exportPlan.renderConfig;
    const projectData = toProjectDocument(store);

    try {
      const res = await fetch('/api/render-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          projectData,
          renderConfig,
          startTime: exportPlan.startTime,
          endTime: exportPlan.endTime,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }

      setCloudSubmitted(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    cloudSubmitted,
    error,
    clearError,
    handleCloudRender,
  };
}
