import { useRef, useState } from 'react';
import { FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ModelAsset } from '@/store/types';
import { ModelFileError, type ReadModel } from '@/models/glb';
import { acceptRelink, relinkModel } from '@/models/modelImport';
import { useModelReady } from '@/models/modelRegistry';
import { ModelFileInput } from '@/models/ModelFileInput';
import { MODEL_TERMS } from '@/models/modelTerms';
import { useModelImportAccess } from '@/models/useModelAccess';

/**
 * Shown while an imported model's file is not in memory (a reloaded project): asks for the file
 * again. The same file just loads. A different one is used only after the user agrees, and only
 * with Pro, since it amounts to importing a new model.
 */
export function ModelRelinkPrompt({ asset, note }: { asset: ModelAsset; note?: string }) {
  const ready = useModelReady(asset);
  const inputRef = useRef<HTMLInputElement>(null);
  const [different, setDifferent] = useState<ReadModel | null>(null);
  const { canImport, askToUpgrade } = useModelImportAccess();

  if (ready) return null;

  const handleFile = async (file: File) => {
    try {
      const result = await relinkModel(asset, file);
      if (result.status === 'linked') {
        setDifferent(null);
        toast.success(MODEL_TERMS.relinked);
      } else {
        setDifferent(result.file);
      }
    } catch (err) {
      toast.error(err instanceof ModelFileError ? err.message : MODEL_TERMS.importFailed);
    }
  };

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
    <div role="alert" className="flex flex-col gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
      <ModelFileInput ref={inputRef} onFile={handleFile} testId={`relink-input-${asset.id}`} />
      <div className="flex items-start gap-2">
        <FileWarning size={15} aria-hidden="true" className="mt-px shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium text-foreground">{MODEL_TERMS.missingTitle}</p>
          <p className="text-muted-foreground">
            <span className="ph-mask">{MODEL_TERMS.missingBody(asset.fileName)}</span>
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
        <Button size="sm" variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
          {MODEL_TERMS.relink}
        </Button>
      )}
    </div>
  );
}
