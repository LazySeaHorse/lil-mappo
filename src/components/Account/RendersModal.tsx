import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { Clapperboard, RefreshCcw, LogIn } from 'lucide-react';

/**
 * Renders modal — shows cloud render job history.
 * Phase 1: UI shell with empty state.
 * Phase 3: Wire to Supabase render_jobs table.
 */
export function RendersModal() {
  const { user, showRendersModal, closeRendersModal, openAuthModal } = useAuthStore();

  return (
    <Dialog open={showRendersModal} onOpenChange={(open) => !open && closeRendersModal()}>
      <DialogContent className="sm:max-w-lg rounded-2xl bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-bold tracking-tight">My Renders</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm mt-0.5">
                Cloud render history and downloads.
              </DialogDescription>
            </div>
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg"
                title="Refresh"
              >
                <RefreshCcw size={14} />
              </Button>
            )}
          </div>
        </DialogHeader>

        {!user ? (
          /* ─── Not Signed In ─── */
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <LogIn size={24} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">Sign in to view renders</p>
              <p className="text-muted-foreground text-xs mt-1">
                Cloud renders let you export high-quality videos without tying up your browser.
              </p>
            </div>
            <Button
              size="sm"
              className="rounded-xl text-xs h-9 px-6"
              onClick={() => { closeRendersModal(); openAuthModal(); }}
            >
              Sign In
            </Button>
          </div>
        ) : (
          /* ─── Signed In (Empty State) ─── */
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="w-14 h-14 rounded-full bg-secondary/50 flex items-center justify-center">
              <Clapperboard size={24} className="text-muted-foreground/50" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">No renders yet</p>
              <p className="text-muted-foreground text-xs mt-1 max-w-[260px] leading-relaxed">
                When you submit a cloud render, it will appear here with its status and download link.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
