import React from 'react';
import { AlertTriangle, Monitor } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface MobileWarningModalProps {
  open: boolean;
  onDismiss: () => void;
}

export function MobileWarningModal({ open, onDismiss }: MobileWarningModalProps) {
  if (!open) return null;
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] sm:max-w-[440px] rounded-2xl bg-background/95 backdrop-blur-xl border-border/40 shadow-2xl p-0 overflow-hidden">
        <div className="p-6 pb-4 bg-gradient-to-b from-amber-500/10 dark:from-amber-500/15 to-transparent">
          <AlertDialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm">
              <AlertTriangle size={22} aria-hidden="true" />
            </div>
            <AlertDialogTitle className="text-xl sm:text-2xl font-medium tracking-tight text-foreground">
              Mobile Support is Experimental
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm leading-relaxed mt-1">
              Editing and rendering on mobile devices is experimental. Many features will be limited or broken on small screens.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <div className="px-6 pb-5 space-y-2">
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-secondary/25 border border-border/30 text-xs text-foreground/90">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
              <Monitor size={13} />
            </span>
            <span>Desktop or laptop recommended for best editing experience</span>
          </div>
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-secondary/25 border border-border/30 text-xs text-foreground/90">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle size={13} />
            </span>
            <span>Timeline editing, complex paths, and exports may be unstable</span>
          </div>
        </div>

        <AlertDialogFooter className="p-4 sm:p-5 bg-secondary/10 border-t border-border/40 flex items-center justify-end">
          <AlertDialogAction
            onClick={onDismiss}
            className="h-9 px-5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm w-full sm:w-auto"
          >
            Continue anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
