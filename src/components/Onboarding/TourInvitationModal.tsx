import React from 'react';
import { Compass, Sparkles, Check } from 'lucide-react';
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

interface TourInvitationModalProps {
  open: boolean;
  onStart: () => void;
  onDismiss: () => void;
}

export function TourInvitationModal({ open, onStart, onDismiss }: TourInvitationModalProps) {
  if (!open) return null;
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] sm:max-w-[440px] rounded-2xl bg-background/95 backdrop-blur-xl border-border/40 shadow-2xl p-0 overflow-hidden">
        <div className="p-6 pb-4 bg-gradient-to-b from-secondary/40 to-transparent">
          <AlertDialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-sm">
              <Compass size={22} aria-hidden="true" />
            </div>
            <AlertDialogTitle className="text-xl sm:text-2xl font-medium tracking-tight">
              Start the quick tour?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm leading-relaxed mt-1">
              Learn how to navigate the map and create your first video animation. This tour takes 90 seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <div className="px-6 pb-5 space-y-2">
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-secondary/25 border border-border/30 text-xs text-foreground/90">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Sparkles size={13} />
            </span>
            <span>Interactive map controls & gestures</span>
          </div>
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-secondary/25 border border-border/30 text-xs text-foreground/90">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Check size={13} />
            </span>
            <span>Camera keyframes & timeline playback</span>
          </div>
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-secondary/25 border border-border/30 text-xs text-foreground/90">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Check size={13} />
            </span>
            <span>Routes, callouts, 3D styles & video export</span>
          </div>
        </div>

        <AlertDialogFooter className="p-4 sm:p-5 bg-secondary/10 border-t border-border/40 flex items-center justify-end gap-2.5">
          <AlertDialogCancel
            onClick={onDismiss}
            className="h-9 px-4 text-xs font-medium rounded-lg border-border/50 bg-background/50 hover:bg-secondary/80"
          >
            Not now
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onStart}
            className="h-9 px-4 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            Start tour
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
