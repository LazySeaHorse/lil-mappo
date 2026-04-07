import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';

export function ToolbarButton({ icon, label, onClick, accent, hideLabel }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean; hideLabel?: boolean }) {
  return (
    <Button
      variant={accent ? "default" : "ghost"}
      size="sm"
      onClick={onClick}
      className={`h-8 ${hideLabel ? 'w-8 px-0' : 'px-2.5'} flex flex-row items-center gap-1.5 text-xs focus-visible:ring-0 rounded-lg transition-all ${accent ? 'shadow-lg shadow-primary/20' : ''}`}
      title={label}
    >
      {icon}
      {!hideLabel && <span className="hidden sm:inline">{label}</span>}
    </Button>
  );
}

export function ToolbarToggle({ icon, label, active, onClick, loading, hideLabel }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; loading?: boolean; hideLabel?: boolean }) {
  return (
    <Toggle
      pressed={active}
      onPressedChange={onClick}
      size="sm"
      className={`h-8 ${hideLabel ? 'w-8 px-0' : 'px-2.5'} flex items-center gap-1.5 text-xs focus-visible:ring-0 rounded-lg data-[state=on]:bg-primary/10 data-[state=on]:text-primary transition-all`}
      title={label}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {!hideLabel && <span className="hidden sm:inline">{label}</span>}
    </Toggle>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={`w-px h-6 bg-border mx-1 ${className || ''}`} />;
}
