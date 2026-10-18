import { Button } from "@/components/ui/button";

/** Full-page fallback shown when the app crashes. `stale` means a chunk failed to load after a deploy. */
export function CrashScreen({ stale }: { stale: boolean }) {
  return (
    <div role="alert" className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-xl font-medium text-foreground">
          {stale ? "A new version is available" : "Something went wrong"}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {stale
            ? "Reload to get the latest version. Your project is autosaved on this device."
            : "That wasn't supposed to happen. Reload to carry on. Your project is autosaved on this device every few seconds."}
        </p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </div>
  );
}
