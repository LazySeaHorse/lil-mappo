import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { InfoTip } from "./InfoTip";

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
  /** Short help. It shows in an (i) tip right after the label. */
  sublabel?: string;
  className?: string;
  /** `data-walkthrough` value the quick tour points at. */
  walkthroughTarget?: string;
}) {
  return (
    <div data-walkthrough={walkthroughTarget} className={cn("flex items-center justify-between gap-3 py-1 px-0.5", className)}>
      <div className="flex items-center gap-1 pr-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {sublabel && <InfoTip text={sublabel} />}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
