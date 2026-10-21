import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PinDropHero, PopupActions, PopupBody } from '@/components/ui/pin-drop';
import { ModelFileInput } from './ModelFileInput';
import { MODEL_TERMS } from './modelTerms';

interface ModelPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A .glb picked from the file picker; the popup closes first. */
  onFile: (file: File) => void;
  /** Test id of the hidden file input. */
  testId?: string;
}

/** The popup the 3D model buttons open: explains the rules, then uploads a .glb file. */
export function ModelPickerDialog({ open, onOpenChange, onFile, testId }: ModelPickerDialogProps) {
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
