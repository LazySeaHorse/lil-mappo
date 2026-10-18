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

interface TourInvitationModalProps {
  open: boolean;
  onStart: () => void;
  onDismiss: () => void;
}

export function TourInvitationModal({ open, onStart, onDismiss }: TourInvitationModalProps) {
  if (!open) return null;
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className={cn(pinDropContentClass, 'w-[calc(100vw-2rem)] sm:max-w-[420px]')}>
        {/* Shows where the tour starts (the Route button) and where it ends up (Export). */}
        <PinDropHero mood="camera" scene="tour" />
        <PopupBody>
          <AlertDialogTitle className={popupTitleClass}>Make your first trip video</AlertDialogTitle>
          <AlertDialogDescription className={popupTextClass}>
            This tour takes about 3 minutes. You plan a route between two places, make the camera follow it, and
            find the Export button. Then you can keep going for 2 more minutes with camera views, a border and a
            callout.
          </AlertDialogDescription>
          <PopupActions>
            <AlertDialogCancel onClick={onDismiss}>
              Not now
            </AlertDialogCancel>
            <AlertDialogAction onClick={onStart}>
              Start tour
            </AlertDialogAction>
          </PopupActions>
        </PopupBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}
