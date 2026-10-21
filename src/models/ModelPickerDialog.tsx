import { useRef } from 'react';
import { Box, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PinDropHero, PopupActions, PopupBody } from '@/components/ui/pin-drop';
import { useProjectStore } from '@/store/useProjectStore';
import type { ModelAsset } from '@/store/types';
import { ModelFileInput } from './ModelFileInput';
import { useModelStatus } from './modelRegistry';
import { MODEL_TERMS, formatBytes } from './modelTerms';

interface ModelPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A .glb picked from the file picker; the popup closes first. */
  onFile: (file: File) => void;
  /** Test id of the hidden file input. */
  testId?: string;
  /** A model the project already has; the popup closes first. */
  onPickModel: (asset: ModelAsset) => void;
}

function ModelRow({ asset, onPick }: { asset: ModelAsset; onPick: () => void }) {
  const status = useModelStatus(asset);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
      >
        <Box size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-col">
          <span className="ph-mask truncate text-sm font-medium">{asset.fileName}</span>
          <span className="text-xs text-muted-foreground">
            {formatBytes(asset.byteSize)}
            {status === 'missing' && ` · ${MODEL_TERMS.needsFile}`}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The popup the 3D model buttons open: explains the rules, lists the models the project has, and uploads a .glb file. */
export function ModelPickerDialog({ open, onOpenChange, onFile, onPickModel, testId }: ModelPickerDialogProps) {
  const models = Object.values(useProjectStore((s) => s.models));
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="max-h-[90vh] overflow-y-auto">
        <PinDropHero mood="cube" scene="model" size="compact" tag={MODEL_TERMS.popupTag} />
        <ModelFileInput
          ref={inputRef}
          testId={testId}
          onFile={(file) => {
            onOpenChange(false);
            onFile(file);
          }}
        />
        <PopupBody>
          <DialogTitle>{MODEL_TERMS.popupTitle}</DialogTitle>
          <DialogDescription>{MODEL_TERMS.popupIntro}</DialogDescription>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-muted-foreground/50">
            {MODEL_TERMS.popupFacts.map((fact) => <li key={fact}>{fact}</li>)}
          </ul>
          {models.length > 0 && (
            <ul aria-label={MODEL_TERMS.listTitle} className="mt-1 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
              {models.map((asset) => (
                <ModelRow
                  key={asset.id}
                  asset={asset}
                  onPick={() => {
                    onOpenChange(false);
                    onPickModel(asset);
                  }}
                />
              ))}
            </ul>
          )}
          <PopupActions>
            <Button type="button" onClick={() => inputRef.current?.click()}>
              <Upload size={14} aria-hidden="true" /> {MODEL_TERMS.upload}
            </Button>
          </PopupActions>
        </PopupBody>
      </DialogContent>
    </Dialog>
  );
}
