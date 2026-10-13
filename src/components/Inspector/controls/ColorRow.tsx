import { ColorPicker } from '@/components/ui/color-picker';
import { cn } from "@/lib/utils";
import { RowLabel } from './RowLabel';

export function ColorRow({
  label,
  value,
  onChange,
  presets,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets?: readonly string[] | string[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs py-0.5", className)}>
      <RowLabel label={label} className="w-28 truncate" />
      <div className="flex-1 flex justify-end min-w-[140px]">
        <ColorPicker value={value} onChange={onChange} presets={presets} />
      </div>
    </div>
  );
}
