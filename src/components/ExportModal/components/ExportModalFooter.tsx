import React from 'react';
import { Clapperboard, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UpcomingFeature } from '@/components/FeatureVotes/UpcomingFeature';
import type { LocalExportCapability } from '@/services/localExportCapability';

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
      {/* Cloud rendering is not built yet: a split segment (label + heart) opens the idea and vote dialog. */}
      <UpcomingFeature featureId="cloud-render" variant="control" className="flex-1" />

      {isExporting ? (
        <Button
          onClick={onCancel}
          variant="outline"
          className="flex-1 min-w-0 h-11 text-sm font-medium border-destructive/30 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50 transition-all"
        >
          Cancel
        </Button>
      ) : (
        <Button
          onClick={onExport}
          disabled={isExportDisabled}
          className="flex-1 min-w-0 h-11 px-3 text-sm font-medium flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:brightness-110 transition-all shadow-lg shadow-primary/10"
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
