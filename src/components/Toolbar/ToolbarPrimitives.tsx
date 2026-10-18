import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Toggle } from '@/components/ui/toggle';

import { cn } from '@/lib/utils';

export function ToolbarButton({
  icon, label, onClick, accent, hideLabel, walkthroughTarget, className, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: boolean;
  hideLabel?: boolean;
  walkthroughTarget?: string;
  className?: string;
  disabled?: boolean;
}) {
  // Icon-only mode → use IconButton
  if (hideLabel) {
    return (
      <IconButton
        variant={accent ? "default" : "toolbar"}
        size="sm"
        onClick={onClick}
        title={label}
        disabled={disabled}
        data-walkthrough={walkthroughTarget}
        className={className}
      >
        {icon}
      </IconButton>
    );
  }

  // Label mode → keep using Button (text + icon)
  return (
    <Button
      variant={accent ? "default" : "ghost"}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={className}
      title={label}
      data-walkthrough={walkthroughTarget}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

export function ToolbarToggle({
  icon, label, active, onClick, loading, hideLabel, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  loading?: boolean;
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  if (hideLabel) {
    return (
      <IconButton
        variant={active ? "toolbar-active" : "toolbar"}
        size="sm"
        onClick={onClick}
        loading={loading}
        disabled={disabled}
        title={label}
        className="shadow-none"
      >
        {icon}
      </IconButton>
    );
  }

  return (
    <Toggle
      pressed={active}
      onPressedChange={() => !disabled && onClick()}
      size="sm"
      disabled={disabled}
      title={label}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      <span className="hidden sm:inline">{label}</span>
    </Toggle>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={`w-px h-6 bg-border mx-1 ${className || ''}`} />;
}
