import React, { useId } from 'react';
import { Button } from '@/components/ui/button';
import { PinDropHero, PopupActions, PopupBody } from '@/components/ui/pin-drop';
import { pinDropContentClass, popupTextClass, popupTitleClass } from '@/components/ui/popup-variants';
import { cn } from '@/lib/utils';
import { FREE_CLOUD_SAVE_LIMIT } from '@/lib/cloudAccess';
import type { LibraryProject } from '@/services/projectLibraryCoordinator';

interface CloudSlotQuotaDialogProps {
  pendingProject: LibraryProject | null;
  projects: LibraryProject[];
  isMutating?: boolean;
  onCancel: () => void;
  /** Offers the paid plan as a way out of the full slots. */
  onUpgrade?: () => void;
  onReplaceAndUpload: (cloudProjectToDelete: LibraryProject) => void;
}

export function CloudSlotQuotaDialog({
  pendingProject,
  projects,
  isMutating,
  onCancel,
  onUpgrade,
  onReplaceAndUpload,
}: CloudSlotQuotaDialogProps) {
  const titleId = useId();
  if (!pendingProject) return null;

  const cloudProjects = projects.filter((p) => p.cloud !== null);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn(pinDropContentClass, 'w-full max-w-[420px] border')}>
        <PinDropHero mood="worried" scene="cloudSlots" />
        <PopupBody>
          <h3 id={titleId} className={popupTitleClass}>Cloud project limit reached</h3>
          <p className={popupTextClass}>
            You reached the limit of {FREE_CLOUD_SAVE_LIMIT} cloud projects. Remove one cloud
            project to upload this project. The app keeps your local copy.
          </p>
        <div className="mt-2 max-h-64 overflow-y-auto flex flex-col gap-2">
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
        <PopupActions className="justify-between">
          {onUpgrade ? (
            <Button
              variant="ghost"
              className="h-10 rounded-[10px] px-3 text-primary hover:text-primary hover:bg-primary/10"
              onClick={onUpgrade}
            >
              Upgrade for unlimited projects
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" className="h-10 rounded-[10px] px-4" onClick={onCancel}>
            Cancel
          </Button>
        </PopupActions>
        </PopupBody>
      </div>
    </div>
  );
}
