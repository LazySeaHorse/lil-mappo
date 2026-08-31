import React from 'react';
import { Clapperboard, Download, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LocalExportCapability } from '@/services/videoExport';

interface ExportModalFooterProps {
  isExporting: boolean;
  cloudSubmitted: boolean;
  progress: number;
  localExportCapability: LocalExportCapability | null;
  onExport: () => void;
  onCancel: () => void;
}

export function ExportModalFooter({
  isExporting,
  cloudSubmitted,
  progress,
  localExportCapability,
  onExport,
  onCancel,
}: ExportModalFooterProps) {
  const isExportDisabled =
    cloudSubmitted ||
    !localExportCapability ||
    localExportCapability.status === 'unsupported';

  return (
    <div className="flex items-center gap-3 px-5 py-5 border-t border-border bg-secondary/10">
      {/* Cloud rendering placeholder (reserved for Modal GPU render worker) */}
      <Button
        variant="outline"
        disabled
        className="flex-1 h-11 text-sm font-medium flex items-center justify-center gap-2 opacity-40 border-dashed cursor-not-allowed"
      >
        <Cloud size={16} className="text-muted-foreground" />
        <span className="font-medium whitespace-nowrap">Cloud render</span>
        <span className="text-[10px] text-muted-foreground font-normal">Not available yet</span>
      </Button>

      {isExporting ? (
        <Button
          onClick={onCancel}
          variant="outline"
          className="flex-1 h-11 text-sm font-medium border-destructive/30 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50 transition-all"
        >
          Cancel
        </Button>
      ) : (
        <Button
          onClick={onExport}
          disabled={isExportDisabled}
          className="flex-1 h-11 text-sm font-medium flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:brightness-110 transition-all shadow-lg shadow-primary/10"
        >
          {progress === 100 ? (
            <>
              <Download size={16} /> Export again
            </>
          ) : (
            <>
              <Clapperboard size={16} /> Export locally
            </>
          )}
        </Button>
      )}
    </div>
  );
}
