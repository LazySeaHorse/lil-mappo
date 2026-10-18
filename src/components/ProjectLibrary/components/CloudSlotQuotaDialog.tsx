import React from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  const cloudProjects = projects.filter((p) => p.cloud !== null);

  return (
    <AlertDialog open={!!pendingProject} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className={cn(pinDropContentClass, 'w-[calc(100vw-2rem)] sm:max-w-[420px]')}>
        <PinDropHero mood="worried" scene="cloudSlots" />
        <PopupBody>
          <AlertDialogTitle className={popupTitleClass}>Cloud project limit reached</AlertDialogTitle>
          <AlertDialogDescription className={popupTextClass}>
            You reached the limit of {FREE_CLOUD_SAVE_LIMIT} cloud projects. Remove one cloud
            project to upload this project. The app keeps your local copy.
          </AlertDialogDescription>
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
                  size="xs"
                  variant="destructive"
                  className="shrink-0 ml-3"
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
                size="lg"
                variant="link"
                onClick={onUpgrade}
              >
                Upgrade for unlimited projects
              </Button>
            ) : (
              <span />
            )}
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </PopupActions>
        </PopupBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}
