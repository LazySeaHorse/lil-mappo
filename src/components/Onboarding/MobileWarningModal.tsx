import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PinDropHero, PopupActions, PopupBody } from '@/components/ui/pin-drop';

interface MobileWarningModalProps {
  open: boolean;
  onDismiss: () => void;
}

export function MobileWarningModal({ open, onDismiss }: MobileWarningModalProps) {
  if (!open) return null;
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <PinDropHero mood="phone" scene="mobile" />
        <PopupBody>
          <AlertDialogTitle>Phones are still experimental</AlertDialogTitle>
          <AlertDialogDescription>
            You can look around and make small edits here. The timeline, long routes and exports may not work
            well on a small screen. A laptop or desktop works best.
          </AlertDialogDescription>
          <PopupActions>
            <AlertDialogAction onClick={onDismiss} className="w-full sm:w-auto">
              Continue on this phone
            </AlertDialogAction>
          </PopupActions>
        </PopupBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}
