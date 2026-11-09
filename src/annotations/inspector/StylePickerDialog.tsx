/**
 * The dialog behind the style picker's Change button.
 *
 * The current style ("Now") plays beside the one being looked at ("New"),
 * both looping in step and starting again together when another style is
 * chosen. The styles are a plain list of icons and names grouped by category,
 * so it stays light however many styles there are: only two previews ever
 * animate. It opens on the style after the current one, so the comparison is
 * live at once. Use style applies the choice and closes; Set as default makes
 * the choice the style new callouts start with. Callouts of different styles
 * have no current style, so "Now" just says so and every style can be applied.
 */

import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import { getAllStyles, getCategories, getStyle } from '@/annotations/registry';
import type { StyleCategory } from '@/annotations/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { PinDropHero } from '@/components/ui/pin-drop';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { MIXED_VALUE, STYLE_TERMS } from '@/lib/terms';
import { cn } from '@/lib/utils';
import { startingCalloutStyleId } from '@/store/itemFactories';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { AnimatedStylePreview } from './AnimatedStylePreview';
import { StyleIcon } from './StyleIcon';

const CATEGORY_LABELS: Record<StyleCategory, string> = {
  label: 'Labels',
  marker: 'Markers',
  editorial: 'Editorial',
  data: 'Data',
  media: 'Media',
  sign: 'Signs',
};

interface StylePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current style; null while the callouts have different ones. */
  value: string | null;
  onChange: (styleId: string) => void;
  /** Text the previews show: the callout's title. */
  text: string;
  /** The callout's subtitle: both previews show it, in the styles that have a place for one. */
  subtitle?: string;
}

export function StylePickerDialog({ open, onOpenChange, ...rest }: StylePickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        aria-describedby={undefined}
        className="flex h-[min(680px,calc(100dvh-2rem))] flex-col sm:max-w-[820px]"
        // The picker can sit inside a dropdown panel; keys typed here must not reach it.
        onKeyDown={(e) => e.stopPropagation()}
      >
        <PinDropHero mood="callout" scene="callouts" size="compact" />
        {/* Mounted only while open, so it starts from the next style each time. */}
        <PickerBody onOpenChange={onOpenChange} {...rest} />
      </DialogContent>
    </Dialog>
  );
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative aspect-[5/4] min-w-0 sm:aspect-auto sm:h-full">
      {children}
      <span className="absolute left-2 top-2 text-2xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function PickerBody({ value, onChange, text, subtitle, onOpenChange }: Omit<StylePickerDialogProps, 'open'>) {
  const reduced = usePrefersReducedMotion();
  const groups = useMemo(() => {
    const all = getAllStyles();
    return getCategories()
      .map((category) => ({ category, styles: all.filter((style) => style.category === category) }))
      .filter((group) => group.styles.length > 0);
  }, []);
  const flat = useMemo(() => groups.flatMap((group) => group.styles), [groups]);
  const [candidate, setCandidate] = useState(() => {
    const index = flat.findIndex((style) => style.id === value);
    return flat[(index + 1) % flat.length]?.id ?? value ?? '';
  });
  const [replay, setReplay] = useState(0);
  const defaultStyle = useUiPreferencesStore((s) => startingCalloutStyleId(s.defaultCalloutStyle));
  const setDefaultStyle = useUiPreferencesStore((s) => s.setDefaultCalloutStyle);
  const rows = useRef<Record<string, HTMLButtonElement | null>>({});
  const next = getStyle(candidate);

  const move = (from: string, step: number) => {
    const index = flat.findIndex((style) => style.id === from);
    const to = flat[Math.min(flat.length - 1, Math.max(0, index + step))].id;
    setCandidate(to);
    rows.current[to]?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border/50 bg-secondary/10 px-4 py-3 pr-14">
        <DialogTitle className="text-sm font-medium tracking-tight">{STYLE_TERMS.dialogTitle}</DialogTitle>
      </div>
      <div className="flex min-h-0 flex-1 flex-col-reverse sm:flex-row">
        <div
          role="listbox"
          aria-label={STYLE_TERMS.list}
          className="min-h-0 flex-1 overflow-y-auto border-t border-border/50 sm:w-[236px] sm:flex-none sm:border-r sm:border-t-0"
        >
          {groups.map((group) => (
            <div key={group.category}>
              <div className="sticky top-0 z-10 bg-background/90 px-3 py-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-xl">
                {CATEGORY_LABELS[group.category] || group.category}
              </div>
              <div className="px-1.5 pb-1.5">
                {group.styles.map((style) => {
                  const selected = style.id === candidate;
                  return (
                    <button
                      key={style.id}
                      ref={(node) => { rows.current[style.id] = node; }}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setCandidate(style.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') { e.preventDefault(); move(style.id, 1); }
                        if (e.key === 'ArrowUp') { e.preventDefault(); move(style.id, -1); }
                      }}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        selected ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-accent/60',
                      )}
                    >
                      <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', selected ? 'bg-primary/15' : 'bg-secondary')}>
                        <StyleIcon name={style.icon} size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{style.name}</span>
                      {style.id === value && <Badge variant="muted" size="sm">{STYLE_TERMS.now}</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 flex-col gap-3 p-4 sm:min-w-0 sm:flex-1">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:min-h-[200px] sm:flex-1">
            <Pane label={STYLE_TERMS.now}>
              {value === null ? (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">{MIXED_VALUE}</div>
              ) : (
                <AnimatedStylePreview styleId={value} text={text} subtitle={subtitle} restartKey={candidate} replay={replay} />
              )}
            </Pane>
            <span className="grid size-6 place-items-center rounded-full bg-secondary text-muted-foreground">
              <ArrowRight className="size-3.5" />
            </span>
            <Pane label={STYLE_TERMS.next}>
              <AnimatedStylePreview styleId={candidate} text={text} subtitle={subtitle} restartKey={candidate} replay={replay} />
            </Pane>
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight text-foreground">{next?.name}</div>
            {reduced && (
              <IconButton variant="secondary" size="sm" aria-label={STYLE_TERMS.playAgain} onClick={() => setReplay((n) => n + 1)}>
                <RotateCcw />
              </IconButton>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={candidate === defaultStyle}
              onClick={() => setDefaultStyle(candidate)}
            >
              {candidate === defaultStyle ? STYLE_TERMS.isDefault : STYLE_TERMS.setDefault}
            </Button>
            <Button
              size="sm"
              disabled={candidate === value}
              onClick={() => {
                onChange(candidate);
                onOpenChange(false);
              }}
            >
              {candidate === value ? <><Check /> {STYLE_TERMS.inUse}</> : STYLE_TERMS.use}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
