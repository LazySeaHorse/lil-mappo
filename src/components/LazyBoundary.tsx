import { Component, Suspense, type ReactNode } from "react";
import { toast } from "sonner";

const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically|Loading chunk/i;

/**
 * Wraps lazy() content. A failed chunk fetch (usually a stale tab after a deploy replaced the
 * hashed files) would otherwise unmount the whole app; here it drops just this subtree and offers
 * a reload. Other errors are rethrown to the surrounding boundary.
 */
class ChunkErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(error: unknown) {
    if (error instanceof Error && CHUNK_ERROR.test(error.message)) return { failed: true };
    throw error;
  }

  componentDidCatch() {
    toast.error("Couldn't load this part of the app. A new version may be available.", {
      id: "chunk-load-error",
      duration: Infinity,
      action: { label: "Reload", onClick: () => window.location.reload() },
    });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function LazyBoundary({ children }: { children: ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={null}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}
