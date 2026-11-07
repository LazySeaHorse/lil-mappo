import { ChevronDown, ChevronRight } from 'lucide-react';
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
