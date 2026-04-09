import React from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useResponsive } from '@/hooks/useResponsive';
import { useToolbarActions } from '@/components/Toolbar/useToolbarActions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  FilePlus2, Save, Library, FileJson, Upload, Settings,
  ChevronDown, Coins, Settings2, Clapperboard, LogIn, LogOut, UserCircle,
} from 'lucide-react';

interface AvatarMenuProps {
  onLibrary: () => void;
  /** Ref-triggered click for the hidden project import input */
  onImportProjectClick: () => void;
}

/**
 * Avatar trigger + dropdown that replaces the old "Project" button.
 * Contains both Project actions and Account actions.
 */
export function AvatarMenu({ onLibrary, onImportProjectClick }: AvatarMenuProps) {
  const { isMobile, isTablet } = useResponsive();
  const { user, openAuthModal, openSettingsModal, openCreditsModal, openRendersModal, signOut } = useAuthStore();
  const { selectItem, setProjectSettingsTab } = useProjectStore();
  const actions = useToolbarActions();

  const initials = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email
      ? user.email[0].toUpperCase()
      : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 ${isMobile || isTablet ? 'px-1' : 'px-1.5'} flex items-center gap-1.5 text-xs font-medium focus-visible:ring-0`}
          title="Menu"
        >
          <Avatar className="h-6 w-6 border border-border/50">
            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.displayName || user.email} />}
            <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
              {initials || <UserCircle size={14} className="text-muted-foreground" />}
            </AvatarFallback>
          </Avatar>
          {!isMobile && !isTablet && (
            <ChevronDown size={14} className="opacity-50" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-56 overflow-hidden bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl rounded-2xl"
      >
        {/* ─── Project Section ─── */}
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 px-3 pt-2.5 pb-1">
          Project
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={actions.handleNewProject} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <FilePlus2 size={14} /> New Project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={actions.handleSaveToLibrary} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <Save size={14} /> Save to Library
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLibrary} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <Library size={14} /> My Projects...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border/30 mx-2" />
          <DropdownMenuItem onClick={actions.handleExportProject} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <FileJson size={14} /> Export Project File
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onImportProjectClick} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <Upload size={14} /> Import Project File
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border/30 mx-2" />
          <DropdownMenuItem
            onClick={() => { setProjectSettingsTab('general'); selectItem(null); }}
            className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg"
          >
            <Settings size={14} /> Project Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {/* ─── Account Section ─── */}
        <DropdownMenuSeparator className="bg-border/50 mx-1" />
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 px-3 pt-2 pb-1">
          Account
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={openCreditsModal} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <Coins size={14} /> Credits
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openSettingsModal} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
            <Settings2 size={14} /> Settings
          </DropdownMenuItem>
          {user && (
            <DropdownMenuItem onClick={openRendersModal} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
              <Clapperboard size={14} /> My Renders
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-border/30 mx-2" />
          {user ? (
            <DropdownMenuItem onClick={signOut} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg text-destructive focus:text-destructive">
              <LogOut size={14} className="text-destructive" /> Sign Out
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={openAuthModal} className="gap-2 cursor-pointer py-2.5 mx-1 rounded-lg">
              <LogIn size={14} /> Sign In
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
