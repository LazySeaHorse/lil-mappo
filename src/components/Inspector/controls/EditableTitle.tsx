import { Input } from "@/components/ui/input";
import { Pencil } from 'lucide-react';

export function EditableTitle({
  value,
  onChange,
  placeholder = "Item name..."
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full mb-3">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 px-3.5 pr-8 text-xs font-medium bg-background/60 hover:bg-background/80 focus:bg-background border-border/50 rounded-lg transition-all shadow-sm placeholder:text-muted-foreground/60"
      />
      <Pencil size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
    </div>
  );
}
