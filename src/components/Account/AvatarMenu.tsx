import React, { useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useResponsive } from '@/hooks/useResponsive';
import { hasByok } from '@/lib/cloudAccess';
import { useToolbarActions } from '@/components/Toolbar/useToolbarActions';
import { Mappo } from '@/components/Mappo/Mappo';
import { accountMood } from '@/components/Mappo/moods';
import { useSubscription } from '@/hooks/useSubscription';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  FilePlus2, Save, Library, FileJson, Upload, Settings,
  ChevronDown, Settings2, Clapperboard, LogIn, LogOut, Lock,
  Compass,
} from 'lucide-react';

interface AvatarMenuProps {
  onLibrary: () => void;
  /** Ref-triggered click for the hidden project import input */
  onImportProjectClick: () => void;
  onWalkthrough: () => void;
}

/**
 * Avatar trigger + dropdown that replaces the old "Project" button.
 * Contains both Project actions and Account actions.
 */
export function AvatarMenu({ onLibrary, onImportProjectClick, onWalkthrough }: AvatarMenuProps) {
  const { isMobile, isTablet } = useResponsive();
  const { user, openAuthModal, openSettingsModal, openRendersModal, signOut } = useAuthStore();
  const { selectItem, setProjectSettingsTab } = useProjectStore();
  const actions = useToolbarActions();
  const { data: subscription } = useSubscription();
  const isLocked = !user && !hasByok();
  const mood = accountMood({ signedIn: !!user, subscription });

  // Run an action once the menu has finished closing. Radix refocuses the menu content
  // as the pointer leaves an item, which steals focus from a dialog that opened alongside it.
  const afterCloseRef = useRef<(() => void) | null>(null);
  const afterClose = (fn: () => void) => () => { afterCloseRef.current = fn; };

  const gatedClick = (fn: () => void) => {
    if (isLocked) openAuthModal();
    else fn();
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="group h-9 px-1.5 flex items-center gap-1.5 text-sm font-medium tracking-tight focus-visible:ring-0 transition-all hover:bg-primary/5 hover:text-primary data-[state=open]:bg-primary/5"
          title="li'l Mappo menu"
        >
          <Mappo
            mood={mood}
            className={`${isMobile ? 'h-6' : 'h-7'} w-auto shrink-0 origin-bottom transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:-rotate-3 group-data-[state=open]:-translate-y-1`}
          />
          {!isMobile && !isTablet && (
            <span className="hidden xl:inline-block">li'l Mappo</span>
          )}
          <ChevronDown size={14} className="opacity-50 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={() => {
          const run = afterCloseRef.current;
          afterCloseRef.current = null;
          run?.();
        }}
        className="w-56 overflow-hidden bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl rounded-2xl"
      >
        {/* ─── Project Section ─── */}
        <DropdownMenuLabel className="text-xs font-medium text-foreground/80 px-3 pt-2.5 pb-1">
          Project
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={afterClose(actions.handleNewProject)} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <FilePlus2 size={14} /> New Project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={actions.handleSaveToLibrary} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <Save size={14} /> Save to Library
            {isLocked && <Lock size={10} className="ml-auto opacity-40" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={afterClose(onLibrary)} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <Library size={14} /> Projects
            {isLocked && <Lock size={10} className="ml-auto opacity-40" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border/30 mx-2" />
          <DropdownMenuItem onClick={afterClose(actions.handleExportProject)} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <FileJson size={14} /> Export Project File
            {isLocked && <Lock size={10} className="ml-auto opacity-40" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gatedClick(onImportProjectClick)} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <Upload size={14} /> Import Project File
            {isLocked && <Lock size={10} className="ml-auto opacity-40" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border/30 mx-2" />
          <DropdownMenuItem
            onClick={() => { setProjectSettingsTab('general'); selectItem(null); }}
            className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg"
          >
            <Settings size={14} /> Project Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={afterClose(onWalkthrough)} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <Compass size={14} /> Quick Walkthrough
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {/* ─── Account Section ─── */}
        <DropdownMenuSeparator className="bg-border/50 mx-1" />
        <DropdownMenuLabel className="text-xs font-medium text-foreground/80 px-3 pt-2 pb-1">
          Account
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {/* Credits return here when cloud rendering is re-enabled. */}
          <DropdownMenuItem onClick={afterClose(openSettingsModal)} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <Settings2 size={14} /> Settings
          </DropdownMenuItem>
          {/* CLOUD RENDERS TEMPORARILY DISABLED — not dead code.
              Re-enable once GPU acceleration is working in the Modal render worker.
          {user && (
            <DropdownMenuItem onClick={openRendersModal} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
              <Clapperboard size={14} /> Cloud renders
            </DropdownMenuItem>
          )}
          */}
          <DropdownMenuSeparator className="bg-border/30 mx-2" />
          {user ? (
            <DropdownMenuItem onClick={signOut} variant="destructive" className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
              <LogOut size={14} /> Sign Out
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={afterClose(openAuthModal)} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
              <LogIn size={14} /> Sign In
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
