import { useId } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, ChevronsLeftRight, Eye, Image as ImageIcon, Smile, Star, Type } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Text-less, purely decorative previews of what an upcoming feature could look
 * like. Animation is plain CSS (see `.skeleton-*` in index.css) and switches off
 * under prefers-reduced-motion.
 */

function Block({ className, delay = 0 }: { className?: string; delay?: number }) {
  return <div className={cn('skeleton-block rounded-md', className)} style={{ ['--skeleton-delay' as string]: `${delay}s` }} />;
}

function Frame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      data-testid="feature-skeleton"
      className={cn('rounded-xl border border-border/50 bg-secondary/20 p-3 select-none pointer-events-none', className)}
    >
      {children}
    </div>
  );
}

const COUNTRY_OUTLINE = 'M49 12 59 17 66 15 69 25 84 29 79 42 87 51 74 62 72 77 57 88 42 79 29 78 28 63 20 49 9 45 12 33 26 34 35 25 44 24 Z';

/** A decorative flag-filled outline, shared by the transparent and composited frames. */
function CountryCutout() {
  const clipId = useId();
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 max-w-full drop-shadow-sm">
      <defs>
        <clipPath id={clipId}><path d={COUNTRY_OUTLINE} /></clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d="M0 0H34V100H0Z" fill="#2563eb" />
        <path d="M34 0H65V100H34Z" fill="#fff" />
        <path d="M65 0H100V100H65Z" fill="#ef4444" />
      </g>
      <path d={COUNTRY_OUTLINE} fill="none" stroke="currentColor" strokeWidth="1.5" pathLength="1" className="route-preview-draw text-foreground/70" />
    </svg>
  );
}

/** A country on transparency, then the same cutout over a backdrop in an edit. */
export function CountryCutoutSkeleton() {
  return (
    <Frame>
      <div className="flex items-center gap-2">
        <div
          className="grid min-w-0 flex-1 place-items-center overflow-hidden rounded-lg border border-border/40 py-2"
          style={{
            backgroundColor: 'hsl(var(--background))',
            backgroundImage: 'conic-gradient(hsl(var(--muted)) 25%, transparent 0 50%, hsl(var(--muted)) 0 75%, transparent 0)',
            backgroundSize: '16px 16px',
          }}
        >
          <CountryCutout />
        </div>
        <ArrowRight size={16} className="shrink-0 text-muted-foreground" />
        <div className="grid min-w-0 flex-1 place-items-center overflow-hidden rounded-lg border border-border/40 bg-gradient-to-br from-sky-500/25 via-emerald-500/15 to-amber-500/25 py-2">
          <CountryCutout />
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <Lane><ClipBar left={6} width={78} className="bg-item-boundary/60" /></Lane>
        <Lane><ClipBar left={0} width={100} className="bg-muted-foreground/20" /></Lane>
      </div>
    </Frame>
  );
}

/** A grid of project cards: thumbnail, title line, meta line and a round avatar. */
export function GallerySkeleton() {
  return (
    <Frame>
      <div className="flex items-center gap-2 mb-3">
        <Block className="h-7 flex-1 rounded-full" />
        <Block className="h-7 w-16 rounded-full" delay={0.2} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn('skeleton-card-in rounded-lg border border-border/40 bg-background/70 p-2 space-y-2', i > 3 && 'hidden sm:block')}
            style={{ ['--skeleton-delay' as string]: `${i * 0.12}s` }}
          >
            <Block className="aspect-video w-full rounded-md" delay={i * 0.15} />
            <Block className="h-2.5 w-4/5" delay={i * 0.15 + 0.1} />
            <div className="flex items-center gap-1.5">
              <Block className="h-4 w-4 rounded-full" delay={i * 0.15 + 0.2} />
              <Block className="h-2 w-1/3" delay={i * 0.15 + 0.3} />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** A render progress card on top of a short job queue. */
export function RenderSkeleton() {
  return (
    <Frame className="space-y-3">
      <div className="rounded-lg border border-border/40 bg-background/70 p-3 flex gap-3">
        <Block className="h-14 w-24 shrink-0 rounded-md" />
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
          <Block className="h-2.5 w-2/3" delay={0.15} />
          <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
            <div className="skeleton-progress-fill h-full w-full rounded-full bg-primary/50" />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="skeleton-card-in flex items-center gap-2 rounded-lg border border-border/30 bg-background/50 p-2"
            style={{ ['--skeleton-delay' as string]: `${i * 0.15}s` }}
          >
            <Block className="h-6 w-6 shrink-0 rounded-full" delay={i * 0.2} />
            <Block className="h-2 flex-1" delay={i * 0.2 + 0.1} />
            <Block className="h-4 w-10 rounded-full" delay={i * 0.2 + 0.2} />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** A timeline lane: bars placed by percentage of its width. */
function Lane({ children }: { children: React.ReactNode }) {
  return <div className="relative h-4">{children}</div>;
}

function ClipBar({ left, width, className }: { left: number; width: number; className: string }) {
  return (
    <div
      className={cn('absolute inset-y-0 rounded-[4px] border border-white/20', className)}
      style={{ left: `${left}%`, width: `${width}%` }}
    />
  );
}

/** The timeline's gutter beside a group: its colour dot and the arrow that collapses it. */
function GroupGutter({ dot, collapsed }: { dot: string; collapsed?: boolean }) {
  const Arrow = collapsed ? ChevronRight : ChevronDown;
  return (
    <div className="flex w-10 shrink-0 items-start gap-0.5 pt-0.5 text-muted-foreground/70">
      <span className={cn('mt-[3px] size-2 rounded-full', dot)} />
      <Arrow size={11} />
    </div>
  );
}

/** A timeline with an open group, a collapsed one and a loose clip, over an inspector whose settings differ between the selected clips. */
export function MultiEditSkeleton() {
  return (
    <Frame className="space-y-3">
      <div className="space-y-2 rounded-lg border border-border/40 bg-background/70 p-2">
        <div className="flex">
          <GroupGutter dot="bg-sky-500" />
          <div className="flex-1 space-y-1 border-l-2 border-sky-500/70 pl-1.5">
            <Lane>
              <ClipBar left={4} width={34} className="bg-item-route/60 ring-2 ring-primary" />
              <ClipBar left={50} width={26} className="bg-item-callout/60 ring-2 ring-primary" />
            </Lane>
            <Lane>
              <ClipBar left={16} width={44} className="bg-item-boundary/60 ring-2 ring-primary" />
            </Lane>
          </div>
        </div>
        <div className="flex">
          <GroupGutter dot="bg-amber-500" collapsed />
          <div className="flex-1 border-l-2 border-amber-500/70 pl-1.5">
            <Lane>
              <ClipBar left={8} width={64} className="bg-amber-500/40" />
              <Block className="absolute right-[22%] top-1 h-2 w-5 rounded-full" />
            </Lane>
          </div>
        </div>
        <div className="flex">
          <div className="w-10 shrink-0" />
          <div className="flex-1 pl-2">
            <Lane>
              <ClipBar left={30} width={25} className="bg-item-route/60" />
            </Lane>
          </div>
        </div>
      </div>

      <div className="space-y-2.5 rounded-lg border border-border/40 bg-background/70 p-3">
        <Block className="h-2.5 w-1/3" />
        <div className="flex items-center gap-3">
          <Block className="h-2 w-14 shrink-0" delay={0.1} />
          {/* A slider whose clips sit at different values: two ghost thumbs. */}
          <div className="relative h-1.5 flex-1 rounded-full bg-primary/15">
            <span className="absolute left-[22%] top-1/2 size-3 -translate-y-1/2 rounded-full border border-dashed border-primary/70 bg-background" />
            <span className="absolute left-[68%] top-1/2 size-3 -translate-y-1/2 rounded-full border border-dashed border-primary/70 bg-background" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Block className="h-2 w-14 shrink-0" delay={0.2} />
          <div className="flex -space-x-1">
            <span className="size-4 rounded-full border border-dashed border-muted-foreground/60 bg-item-route/70" />
            <span className="size-4 rounded-full border border-dashed border-muted-foreground/60 bg-item-callout/70" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Block className="h-2 w-14 shrink-0" delay={0.3} />
          {/* Same for all: a plain control. */}
          <div className="h-4 w-8 rounded-full bg-primary/50 p-0.5">
            <span className="block size-3 translate-x-4 rounded-full bg-background" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** One layer in the overlays list: a visibility eye, its name line and the kind of overlay. */
function LayerRow({ kind: Kind, selected, delay }: { kind: typeof Type; selected?: boolean; delay: number }) {
  return (
    <div
      className={cn(
        'skeleton-card-in flex items-center gap-1.5 rounded-md border bg-background/70 px-1.5 py-1',
        selected ? 'border-primary/60' : 'border-border/40',
      )}
      style={{ ['--skeleton-delay' as string]: `${delay}s` }}
    >
      <Eye size={10} className="shrink-0 text-muted-foreground/70" />
      <Block className="h-2 flex-1" delay={delay} />
      <Kind size={10} className="shrink-0 text-muted-foreground/70" />
    </div>
  );
}

function Handle({ className }: { className: string }) {
  return <span className={cn('absolute size-1.5 border border-primary bg-background', className)} />;
}

/** The video frame with a logo, a title, a sticker and a photo placed on the map, beside the list of those layers and their bars on the timeline. */
export function OverlaysSkeleton() {
  return (
    <Frame className="space-y-3">
      <div className="flex gap-3">
        <div className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded-lg border border-border/40 bg-gradient-to-br from-emerald-500/15 via-sky-500/10 to-sky-500/25">
          {/* A faint road so the overlays read as sitting on a map. */}
          <div className="absolute -left-2 top-[58%] h-1 w-[120%] -rotate-12 rounded-full bg-background/60" />
          <div className="absolute left-2 top-2 grid size-6 place-items-center rounded-md bg-primary/75 text-primary-foreground">
            <Star size={12} />
          </div>
          <div className="absolute bottom-2.5 left-2.5 space-y-1">
            <Block className="h-3 w-24 !bg-foreground/25" />
            <Block className="h-2 w-16" delay={0.2} />
          </div>
          <div className="absolute right-[26%] top-3 grid size-8 rotate-12 place-items-center rounded-full bg-amber-400/80 text-amber-950">
            <Smile size={16} />
          </div>
          <div className="absolute bottom-2 right-2 grid h-10 w-16 place-items-center rounded border-2 border-primary bg-item-boundary/40 text-foreground/60">
            <ImageIcon size={14} />
            <Handle className="-left-1 -top-1" />
            <Handle className="-right-1 -top-1" />
            <Handle className="-bottom-1 -left-1" />
            <Handle className="-bottom-1 -right-1" />
          </div>
        </div>
        <div className="w-24 shrink-0 space-y-1.5 sm:w-28">
          <LayerRow kind={Star} delay={0} />
          <LayerRow kind={Type} delay={0.12} />
          <LayerRow kind={Smile} delay={0.24} />
          <LayerRow kind={ImageIcon} delay={0.36} selected />
        </div>
      </div>
      <div className="space-y-1 rounded-lg border border-border/40 bg-background/70 p-2">
        <Lane>
          <ClipBar left={0} width={100} className="bg-primary/35" />
        </Lane>
        <Lane>
          <ClipBar left={10} width={42} className="bg-item-callout/60" />
          <ClipBar left={58} width={30} className="bg-item-boundary/60" />
        </Lane>
      </div>
    </Frame>
  );
}

/** Building heights as a share of the scene, left to right. */
const SKYLINE = [38, 62, 46, 80, 54, 70, 42];

/** The same street twice: flat blocks on the left, the real buildings with roofs and windows on the right. */
export function EarthSkeleton() {
  return (
    <Frame>
      <div className="relative h-28 overflow-hidden rounded-lg border border-border/40 bg-gradient-to-b from-sky-500/20 to-sky-500/5">
        <div className="absolute inset-x-0 bottom-0 h-3 bg-emerald-500/20" />
        <div className="absolute inset-0 flex items-end justify-around px-3 pb-3">
          {SKYLINE.map((height, i) => {
            const real = i >= 4;
            return (
              <div
                key={i}
                className={cn('relative w-[11%] rounded-t-[3px]', real ? 'bg-stone-400/60' : 'bg-muted-foreground/20')}
                style={{
                  height: `${real ? height : 28}%`,
                  ...(real
                    ? { backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 5px, rgba(255,255,255,0.35) 5px 7px), repeating-linear-gradient(90deg, transparent 0 4px, rgba(0,0,0,0.12) 4px 5px)' }
                    : {}),
                }}
              >
                {real && i % 2 === 0 && <span className="absolute -top-1.5 left-1/2 h-1.5 w-[70%] -translate-x-1/2 rounded-t-full bg-stone-500/60" />}
              </div>
            );
          })}
        </div>
        <div className="absolute inset-y-0 left-[52%] w-px bg-foreground/50" />
        <span className="absolute left-[52%] top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-foreground/40 bg-background text-muted-foreground">
          <ChevronsLeftRight size={11} />
        </span>
      </div>
    </Frame>
  );
}
