import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Toggle } from '@/components/ui/toggle';

export function ToolbarButton({
  icon, label, onClick, accent, hideLabel,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: boolean;
  hideLabel?: boolean;
}) {
  // Icon-only mode → use IconButton
  if (hideLabel) {
    return (
      <IconButton
        variant={accent ? "default" : "toolbar"}
        size="sm"
        onClick={onClick}
        title={label}
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
      className={`h-8 px-2.5 flex flex-row items-center gap-1.5 text-xs focus-visible:ring-0 rounded-lg transition-all ${accent ? 'shadow-lg shadow-primary/20' : ''}`}
      title={label}
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
      className={`h-8 px-2.5 flex items-center gap-1.5 text-xs focus-visible:ring-0 rounded-lg data-[state=on]:bg-primary/10 data-[state=on]:text-primary transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={label}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      <span className="hidden sm:inline">{label}</span>
    </Toggle>
  );
}

// Divider stays unchanged
export function Divider({ className }: { className?: string }) {
  return <div className={`w-px h-6 bg-border mx-1 ${className || ''}`} />;
}
