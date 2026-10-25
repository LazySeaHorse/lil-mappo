import { useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Box, Check, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PinDropHero, PopupActions, PopupBody } from '@/components/ui/pin-drop';
import { useProjectStore } from '@/store/useProjectStore';
import type { ModelAsset } from '@/store/types';
import { ModelFileError } from './glb';
import { ModelFileInput } from './ModelFileInput';
import { addModelFromUrl, parseModelUrls } from './modelUrl';
import { useModelStatus } from './modelRegistry';
import { MODEL_TERMS, formatBytes } from './modelTerms';

interface ModelPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A .glb picked from the file picker; the popup closes first, unless `keepOpen`. */
  onFile: (file: File) => void;
  /** Test id of the hidden file input. */
  testId?: string;
  /** A model the project already has; the popup closes first, unless `keepOpen`. */
  onPickModel: (asset: ModelAsset) => void;
  /** The popup stays open after a pick, for a next step the caller shows as `children`. */
  keepOpen?: boolean;
  /** A step shown in place of the list (the toolbar's placing step). */
  children?: ReactNode;
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

/** One pasted link and how loading it went. */
interface UrlRow {
  key: number;
  url: string;
  status: 'loading' | 'added' | 'error';
  message?: string;
}

function UrlStatusRow({ row }: { row: UrlRow }) {
  const Icon = row.status === 'loading' ? Loader2 : row.status === 'added' ? Check : AlertTriangle;
  return (
    <li data-testid="model-url-row" data-status={row.status} className="flex items-start gap-2 text-xs">
      <Icon
        size={14}
        aria-hidden="true"
        className={`mt-px shrink-0 ${row.status === 'loading' ? 'animate-spin text-muted-foreground' : row.status === 'added' ? 'text-emerald-600' : 'text-destructive'}`}
      />
      <span className="flex min-w-0 flex-col">
        <span className="ph-mask truncate text-foreground">{row.url}</span>
        <span className={row.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
          {row.status === 'loading' ? MODEL_TERMS.urlLoading : row.status === 'added' ? MODEL_TERMS.urlAdded : row.message}
        </span>
      </span>
    </li>
  );
}

/** The popup the 3D model buttons open: explains the rules, lists the models the project has, and adds one from a file or pasted links. */
export function ModelPickerDialog({ open, onOpenChange, onFile, onPickModel, testId, keepOpen = false, children }: ModelPickerDialogProps) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<UrlRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const nextKey = useRef(0);
  const models = Object.values(useProjectStore((s) => s.models));
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    if (!keepOpen) onOpenChange(false);
  };

  const patchRow = (key: number, patch: Partial<UrlRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addUrls = () => {
    const { urls, skipped: left } = parseModelUrls(text);
    if (urls.length === 0) return;
    const added = urls.map((url): UrlRow => ({ key: nextKey.current++, url, status: 'loading' }));
    setRows((current) => [...current, ...added]);
    setSkipped(left);
    setText('');
    for (const { key, url } of added) {
      addModelFromUrl(url).then(
        () => patchRow(key, { status: 'added' }),
        (err) => patchRow(key, { status: 'error', message: err instanceof ModelFileError ? err.message : MODEL_TERMS.importFailed }),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="max-h-[90vh] overflow-y-auto">
        <PinDropHero mood="cube" scene="model" size="compact" tag={MODEL_TERMS.popupTag} />
        {children ?? (
          <>
            <ModelFileInput
              ref={inputRef}
              testId={testId}
              onFile={(file) => {
                close();
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
                        close();
                        onPickModel(asset);
                      }}
                    />
                  ))}
                </ul>
              )}
              <label className="mt-2 text-xs font-medium text-muted-foreground" htmlFor="model-urls">{MODEL_TERMS.urlLabel}</label>
              <Textarea
                id="model-urls"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={MODEL_TERMS.urlPlaceholder}
                rows={2}
                className="ph-mask"
              />
              {rows.length > 0 && (
                <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                  {rows.map((row) => <UrlStatusRow key={row.key} row={row} />)}
                </ul>
              )}
              {skipped > 0 && <p className="text-xs text-muted-foreground">{MODEL_TERMS.urlSkipped(skipped)}</p>}
              <PopupActions>
                <Button type="button" variant="outline" disabled={parseModelUrls(text).urls.length === 0} onClick={addUrls}>
                  {MODEL_TERMS.urlAdd}
                </Button>
                <Button type="button" onClick={() => inputRef.current?.click()}>
                  <Upload size={14} aria-hidden="true" /> {MODEL_TERMS.upload}
                </Button>
              </PopupActions>
            </PopupBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
