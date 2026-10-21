import { useRef, useState } from 'react';
import { AlertTriangle, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ModelAsset } from '@/store/types';
import { ModelFileError, type ReadModel } from '@/models/glb';
import { acceptRelink, relinkModel, type RelinkResult } from '@/models/modelImport';
import { relinkModelFromUrl } from '@/models/modelUrl';
import { useModelStatus } from '@/models/modelRegistry';
import { ModelFileInput } from '@/models/ModelFileInput';
import { MODEL_TERMS } from '@/models/modelTerms';
import { useModelImportAccess } from '@/models/useModelAccess';

/**
 * Shown while an imported model's file is not in memory (a reloaded project): asks for the file
 * again. The same file just loads. A different one is used only after the user agrees, and only
 * with Pro, since it amounts to importing a new model. Also shown, as an error, when the map could
 * not load the file: then only a different file can help.
 */
export function ModelRelinkPrompt({ asset, note }: { asset: ModelAsset; note?: string }) {
  const status = useModelStatus(asset);
  const inputRef = useRef<HTMLInputElement>(null);
  const [different, setDifferent] = useState<ReadModel | null>(null);
  const { canImport, askToUpgrade } = useModelImportAccess();

  if (status === 'ready') return null;
  const failed = status === 'failed';
  const Icon = failed ? AlertTriangle : FileWarning;

  const handleResult = (result: RelinkResult) => {
    if (result.status === 'linked' && failed) {
      // The same bytes the map already could not load.
      toast.error(MODEL_TERMS.sameFileFailed);
    } else if (result.status === 'linked') {
      setDifferent(null);
      toast.success(MODEL_TERMS.relinked);
    } else {
      setDifferent(result.file);
    }
  };

  const attempt = async (relink: () => Promise<RelinkResult>) => {
    try {
      handleResult(await relink());
    } catch (err) {
      toast.error(err instanceof ModelFileError ? err.message : MODEL_TERMS.importFailed);
    }
  };

  const handleFile = (file: File) => attempt(() => relinkModel(asset, file));
  const retryUrl = () => attempt(() => relinkModelFromUrl(asset));

  const useDifferent = () => {
    if (!different) return;
    if (!canImport) {
      askToUpgrade();
      return;
    }
    acceptRelink(asset.id, different);
    setDifferent(null);
    toast.success(MODEL_TERMS.relinked);
  };

  return (
    <div
      role="alert"
      className={`flex flex-col gap-2.5 rounded-xl border p-3 text-xs ${failed ? 'border-destructive/40 bg-destructive/10' : 'border-amber-500/40 bg-amber-500/10'}`}
    >
      <ModelFileInput ref={inputRef} onFile={handleFile} testId={`relink-input-${asset.id}`} />
      <div className="flex items-start gap-2">
        <Icon size={15} aria-hidden="true" className={`mt-px shrink-0 ${failed ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium text-foreground">{failed ? MODEL_TERMS.failedTitle : MODEL_TERMS.missingTitle}</p>
          <p className="text-muted-foreground">
            <span className="ph-mask">{failed ? MODEL_TERMS.failedBody(asset.fileName) : asset.sourceUrl ? MODEL_TERMS.missingFromUrl(asset.fileName) : MODEL_TERMS.missingBody(asset.fileName)}</span>
            {note ? ` ${note}` : ''}
          </p>
        </div>
      </div>
      {different ? (
        <div className="flex flex-col gap-2">
          <p className="ph-mask text-foreground">{MODEL_TERMS.mismatch(asset.fileName)}</p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={useDifferent}>{MODEL_TERMS.useAnyway}</Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setDifferent(null)}>{MODEL_TERMS.cancel}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {asset.sourceUrl && !failed && (
            <Button size="sm" className="w-full" onClick={retryUrl}>{MODEL_TERMS.retryUrl}</Button>
          )}
          <Button size="sm" variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
            {failed ? MODEL_TERMS.pickOther : MODEL_TERMS.relink}
          </Button>
        </div>
      )}
    </div>
  );
}
