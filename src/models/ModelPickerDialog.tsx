import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PopupActions } from '@/components/ui/pin-drop';
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

/** The popup the 3D model buttons open: upload a .glb file, or (soon) reuse one the project has. */
export function ModelPickerDialog({ open, onOpenChange, onFile, testId }: ModelPickerDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-6 text-left">
          <DialogTitle>{MODEL_TERMS.popupTitle}</DialogTitle>
        </DialogHeader>
        <ModelFileInput
          ref={inputRef}
          testId={testId}
          onFile={(file) => {
            onOpenChange(false);
            onFile(file);
          }}
        />
        <PopupActions className="px-6 pb-6">
          <Button type="button" onClick={() => inputRef.current?.click()}>
            <Upload size={14} aria-hidden="true" /> {MODEL_TERMS.upload}
          </Button>
        </PopupActions>
      </DialogContent>
    </Dialog>
  );
}
