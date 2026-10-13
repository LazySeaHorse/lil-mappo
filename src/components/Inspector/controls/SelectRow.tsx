import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RowLabel } from './RowLabel';

export function SelectRow<T extends string>({
  label,
  icon,
  value,
  onChange,
  options,
  renderOption,
  className,
}: {
  label: string;
  icon?: React.ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; style?: React.CSSProperties }[];
  renderOption?: (option: { value: T; label: string; style?: React.CSSProperties }) => React.ReactNode;
  className?: string;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <div className={cn("flex items-center justify-between gap-3 text-xs py-0.5", className)}>
      <RowLabel label={label} icon={icon} className="w-28 truncate" />
      <div className="flex-1">
        <Select value={value} onValueChange={(v) => onChange(v as T)}>
          <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50 rounded-lg w-full">
            <SelectValue>
              {selected && renderOption ? renderOption(selected) : selected?.label ?? value}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {renderOption ? renderOption(o) : <span style={o.style}>{o.label}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
