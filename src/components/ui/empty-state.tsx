import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  variant?: 'modal' | 'dropdown';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'modal',
  className,
}: EmptyStateProps) {
  const isDropdown = variant === 'dropdown';

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center select-none",
        isDropdown ? "py-8 px-4" : "py-12 px-6",
        className
      )}
    >
      <div
        className={cn(
          "rounded-2xl bg-secondary/50 border border-border/40 flex items-center justify-center text-muted-foreground shadow-inner mb-3.5",
          isDropdown ? "w-12 h-12" : "w-16 h-16"
        )}
      >
        <Icon size={isDropdown ? 22 : 28} className="stroke-[1.5px]" />
      </div>
      <p className="text-sm font-medium text-foreground tracking-tight">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-[260px] leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
