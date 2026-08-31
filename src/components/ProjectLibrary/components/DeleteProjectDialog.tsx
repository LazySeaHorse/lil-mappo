import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
      <AlertDialogContent className="max-w-[420px] rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project</AlertDialogTitle>
          <AlertDialogDescription>
            Delete <span className="font-medium text-foreground">"{project?.name || 'Untitled project'}"</span>? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isMutating}
            className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
