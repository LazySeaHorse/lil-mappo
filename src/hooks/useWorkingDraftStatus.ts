import { useSyncExternalStore } from 'react';
import { workingProjectDraftManager, type DraftSaveStatus } from '@/services/workingProjectDraft';

const FAILURE_COPY = {
  'storage-full': 'Not saved: your device is out of storage.',
  'storage-unavailable': 'Not saved: this browser blocks storage.',
  failed: 'Not saved: an error occurred.',
} as const;

/** Short text for an autosave status. The draft lives on this device, so that is what it says. */
export function draftStatusLabel(status: DraftSaveStatus): string {
  switch (status.state) {
    case 'saved': return 'Saved on this device';
    case 'saving': return 'Saving…';
    case 'error': return FAILURE_COPY[status.reason];
  }
}

/** The autosave status and its label; re-renders only when the status changes. */
export function useWorkingDraftStatus(): { status: DraftSaveStatus; label: string } {
  const status = useSyncExternalStore(workingProjectDraftManager.subscribe, workingProjectDraftManager.getStatus);
  return { status, label: draftStatusLabel(status) };
}
