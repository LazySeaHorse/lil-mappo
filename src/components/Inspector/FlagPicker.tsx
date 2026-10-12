import React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { flagName, getFlagOptions, loadFlagSvg } from '@/components/MapViewport/runtime/flagImages';

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Small flag image. The artwork is fetched only once the thumbnail scrolls into view. */
export function FlagThumb({ code, className }: { code: string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [src, setSrc] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState(typeof IntersectionObserver === 'undefined');

  React.useEffect(() => {
    const node = ref.current;
    if (visible || !node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  React.useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setSrc(null);
    loadFlagSvg(code)
      .then((svg) => { if (!cancelled) setSrc(svgDataUrl(svg)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [code, visible]);

  return (
    <span ref={ref} className={cn('inline-block h-[15px] w-5 shrink-0 overflow-hidden rounded-[3px] bg-muted/60 ring-1 ring-border/50', className)}>
      {src && <img src={src} alt="" width={20} height={15} className="h-full w-full object-cover" data-testid={`flag-thumb-${code}`} />}
    </span>
  );
}

/** Searchable list of country flags. */
export function FlagPicker({ value, onChange }: { value: string | null; onChange: (code: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const options = React.useMemo(() => getFlagOptions(), []);
  const currentName = flagName(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label="Country flag"
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-border/40 bg-secondary/30 px-2.5 text-left text-xs transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
        >
          {value && currentName ? (
            <>
              <FlagThumb code={value} />
              <span className="flex-1 truncate">{currentName}</span>
            </>
          ) : (
            <span className="flex-1 truncate text-muted-foreground">Choose a country flag</span>
          )}
          <ChevronsUpDown size={13} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
        <Command>
          <CommandInput placeholder="Search countries" />
          <CommandList className="ph-no-capture max-h-60">
            <CommandEmpty>No country found.</CommandEmpty>
            {options.map(({ code, name }) => (
              <CommandItem
                key={code}
                value={`${name} ${code}`}
                onSelect={() => {
                  onChange(code);
                  setOpen(false);
                }}
                className="gap-2 text-xs"
              >
                <FlagThumb code={code} />
                <span className="flex-1 truncate">{name}</span>
                {code === value && <Check size={13} className="text-primary" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
