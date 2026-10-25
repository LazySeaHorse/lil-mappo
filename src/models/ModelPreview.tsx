import { useEffect, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import { loadModelPreview } from '@/lib/lazyModules';
import type { ModelAsset } from '@/store/types';
import { useModelRegistry } from './modelRegistry';
import { MODEL_TERMS } from './modelTerms';

/**
 * The model as it will look, turning slowly, drawn from the same bytes the map loads (converted when
 * the file needed it). A model whose file is missing, or that cannot be drawn here, shows a cube icon.
 */
export function ModelPreview({ asset }: { asset: ModelAsset }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = useModelRegistry((s) => s.loaded[asset.sha256]?.url);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const shown = !!url && failedUrl !== url;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!url || !canvas) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    loadModelPreview()
      .then(({ startModelPreview }) => startModelPreview(canvas, url))
      .then(
        (preview) => {
          if (cancelled) preview.dispose();
          else dispose = preview.dispose;
        },
        () => {
          if (!cancelled) setFailedUrl(url);
        },
      );
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [url]);

  return (
    <div
      data-testid="model-preview"
      data-state={shown ? 'model' : 'placeholder'}
      className="relative h-40 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted/40"
    >
      {shown ? (
        <canvas ref={canvasRef} role="img" aria-label={MODEL_TERMS.previewLabel(asset.fileName)} className="h-full w-full" />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Box size={32} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
