import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function SwitchRow({
  label,
  checked,
  onChange,
  sublabel,
  className,
  walkthroughTarget,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  sublabel?: string;
  className?: string;
  /** `data-walkthrough` value the quick tour points at. */
  walkthroughTarget?: string;
}) {
  return (
    <div data-walkthrough={walkthroughTarget} className={cn("flex items-center justify-between gap-3 py-1 px-0.5", className)}>
      <div className="flex flex-col pr-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {sublabel && <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">{sublabel}</span>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
