import { forwardRef } from 'react';

/** Hidden .glb file picker; open it with `ref.current.click()`. Calls `onFile` with the picked file. */
export const ModelFileInput = forwardRef<HTMLInputElement, { onFile: (file: File) => void; testId?: string }>(
  ({ onFile, testId = 'model-file-input' }, ref) => (
    <input
      ref={ref}
      type="file"
      accept=".glb,model/gltf-binary"
      className="hidden"
      tabIndex={-1}
      aria-hidden="true"
      data-testid={testId}
      onChange={(e) => {
        const file = e.target.files?.[0];
        // Cleared so picking the same file again still fires a change.
        e.target.value = '';
        if (file) onFile(file);
      }}
    />
  ),
);
ModelFileInput.displayName = 'ModelFileInput';
