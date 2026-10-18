import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PinDropHero, PopupActions, PopupBody } from '@/components/ui/pin-drop';
import { pinDropContentClass, popupTextClass, popupTitleClass } from '@/components/ui/popup-variants';
import { cn } from '@/lib/utils';
import type { LibraryProject } from '@/services/projectLibraryCoordinator';

interface DeleteProjectDialogProps {
  project: LibraryProject | null;
  isMutating?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteProjectDialog({
  project,
  isMutating,
  onCancel,
  onConfirm,
}: DeleteProjectDialogProps) {
  return (
    <AlertDialog open={!!project} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className={cn(pinDropContentClass, 'w-[calc(100vw-2rem)] sm:max-w-[420px]')}>
        <PinDropHero mood="nervous" scene="delete" />
        <PopupBody>
          <AlertDialogTitle className={popupTitleClass}>Delete project</AlertDialogTitle>
          <AlertDialogDescription className={popupTextClass}>
            Delete <span className="ph-mask font-medium text-foreground">"{project?.name || 'Untitled project'}"</span>? You cannot undo this action.
          </AlertDialogDescription>
          <PopupActions>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={onConfirm}
              disabled={isMutating}
            >
              Delete
            </AlertDialogAction>
          </PopupActions>
        </PopupBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}
