import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PinDropHero, PopupActions, PopupBody } from '@/components/ui/pin-drop';
import { pinDropContentClass, popupTextClass, popupTitleClass } from '@/components/ui/popup-variants';
import { cn } from '@/lib/utils';

interface MobileWarningModalProps {
  open: boolean;
  onDismiss: () => void;
}

export function MobileWarningModal({ open, onDismiss }: MobileWarningModalProps) {
  if (!open) return null;
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className={cn(pinDropContentClass, 'w-[calc(100vw-2rem)] sm:max-w-[420px]')}>
        <PinDropHero mood="phone" spot="alcatraz" tag="You are here" />
        <PopupBody>
          <AlertDialogTitle className={popupTitleClass}>Phones are still experimental</AlertDialogTitle>
          <AlertDialogDescription className={popupTextClass}>
            You can look around and make small edits here. The timeline, long routes and exports may not work
            well on a small screen. A laptop or desktop works best.
          </AlertDialogDescription>
          <PopupActions>
            <AlertDialogAction onClick={onDismiss} className="h-10 w-full rounded-[10px] px-4 sm:w-auto">
              Continue on this phone
            </AlertDialogAction>
          </PopupActions>
        </PopupBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}
