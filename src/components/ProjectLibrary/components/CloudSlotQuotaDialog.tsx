import React from 'react';
import { Button } from '@/components/ui/button';
import { FREE_CLOUD_SAVE_LIMIT } from '@/lib/cloudAccess';
import type { LibraryProject } from '@/services/projectLibraryCoordinator';

interface CloudSlotQuotaDialogProps {
  pendingProject: LibraryProject | null;
  projects: LibraryProject[];
  isMutating?: boolean;
  onCancel: () => void;
  onReplaceAndUpload: (cloudProjectToDelete: LibraryProject) => void;
}

export function CloudSlotQuotaDialog({
  pendingProject,
  projects,
  isMutating,
  onCancel,
  onReplaceAndUpload,
}: CloudSlotQuotaDialogProps) {
  if (!pendingProject) return null;

  const cloudProjects = projects.filter((p) => p.cloud !== null);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-[420px] overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-medium">Cloud project limit reached</h3>
          <p className="text-xs text-muted-foreground mt-1">
            You used all {FREE_CLOUD_SAVE_LIMIT} cloud project slots. Remove one cloud
            copy, then upload this project. Its local copy will be kept.
          </p>
        </div>
        <div className="px-5 py-4 max-h-64 overflow-y-auto flex flex-col gap-2">
          {cloudProjects.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-3 border border-border rounded-xl hover:border-destructive/40 hover:bg-destructive/5 transition-all"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">{p.name || 'Untitled'}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-3 text-xs shrink-0 ml-3"
                onClick={() => onReplaceAndUpload(p)}
                disabled={isMutating}
              >
                Remove and upload
              </Button>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border bg-secondary/20 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
