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
