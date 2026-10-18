import { Component, type ErrorInfo, type ReactNode } from "react";
import { CrashScreen } from "./CrashScreen";
import { isChunkLoadError } from "@/lib/chunkErrors";
import { track } from "@/lib/analytics";

interface State {
  error: Error | null;
}

/**
 * Last line of defence: without it any uncaught render error unmounts the whole app to a blank
 * page. The editor autosaves a local draft every few seconds, so a reload restores nearly all work.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App crashed:", error, info.componentStack);
    track("app_crashed", { error_class: isChunkLoadError(error) ? "chunk_load" : "other" });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <CrashScreen stale={isChunkLoadError(error)} />;
  }
}
