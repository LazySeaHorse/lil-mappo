import React, { useState } from 'react';
import { nanoid } from 'nanoid';
import { X, ChevronLeft } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import type { VideoOverlay } from '@/store/types';
import { useResponsive } from '@/hooks/useResponsive';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { OverlayList } from './OverlayList';
import { OverlayPreview } from './OverlayPreview';
import { OverlayProperties } from './OverlayProperties';

// ─── Default shapes for new overlays ─────────────────────────────────────────

function makeTextOverlay(): VideoOverlay {
  return {
    id: nanoid(),
    kind: 'text',
    enabled: true,
    x: 0.05,
    y: 0.05,
    width: 0.3,
    height: 0.08,
    opacity: 1,
    text: 'New Text',
    fontFamily: 'Outfit',
    fontSize: 32,
    color: '#ffffff',
    fontWeight: 'bold',
  };
}

function makeImageOverlay(): VideoOverlay {
  return {
    id: nanoid(),
    kind: 'image',
    enabled: true,
    x: 0.05,
    y: 0.05,
    width: 0.10,
    height: 0.10,
    opacity: 1,
  };
}

// ─── Desktop layout (3-panel) ─────────────────────────────────────────────────

function DesktopLayout({
  selectedId,
  setSelectedId,
}: {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const { overlays, addOverlay } = useProjectStore();
  const selectedOverlay = overlays.find((o) => o.id === selectedId) ?? null;

  function handleAddText() {
    const o = makeTextOverlay();
    addOverlay(o);
    setSelectedId(o.id);
  }
  function handleAddImage() {
    const o = makeImageOverlay();
    addOverlay(o);
    setSelectedId(o.id);
  }

  return (
    <div className="flex h-full gap-0 overflow-hidden">
      {/* Left: overlay list */}
      <div className="w-[190px] shrink-0 flex flex-col border-r border-border/40 px-2 py-3 gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1 mb-1">
          Layers
        </h3>
        <OverlayList
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddText={handleAddText}
          onAddImage={handleAddImage}
        />
      </div>

      {/* Center: preview */}
      <div className="flex-1 min-w-0 flex flex-col py-3 px-2">
        <OverlayPreview selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {/* Right: properties */}
      <div className="w-[210px] shrink-0 border-l border-border/40 px-3 py-3 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {selectedOverlay ? (
          <>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3">
              Properties
            </h3>
            <OverlayProperties overlay={selectedOverlay} />
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground/50 text-center mt-8 leading-relaxed px-2">
            Select an overlay to edit its properties.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Mobile layout (stacked) ──────────────────────────────────────────────────

function MobileLayout({
  selectedId,
  setSelectedId,
}: {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const { overlays, addOverlay } = useProjectStore();
  const selectedOverlay = overlays.find((o) => o.id === selectedId) ?? null;
  const showProperties = selectedId !== null && selectedOverlay !== null;

  function handleAddText() {
    const o = makeTextOverlay();
    addOverlay(o);
    setSelectedId(o.id);
  }
  function handleAddImage() {
    const o = makeImageOverlay();
    addOverlay(o);
    setSelectedId(o.id);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top: aspect-ratio preview ~45% height */}
      <div className="shrink-0 px-2 pt-2 pb-1" style={{ height: '45%' }}>
        <OverlayPreview selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {/* Bottom: list or properties panel */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col border-t border-border/40">
        {showProperties ? (
          <div className="flex flex-col h-full">
            {/* Back header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 shrink-0">
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setSelectedId(null)}
              >
                <ChevronLeft size={14} />
                Overlays
              </button>
              <span className="text-xs font-medium text-foreground ml-1 capitalize">
                {selectedOverlay!.kind === 'watermark' ? 'Watermark' : selectedOverlay!.kind}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: 'none' }}>
              <OverlayProperties overlay={selectedOverlay!} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full px-2 py-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1 mb-2">
              Layers
            </h3>
            <OverlayList
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAddText={handleAddText}
              onAddImage={handleAddImage}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

interface OverlayModalProps {
  open: boolean;
  onClose: () => void;
}

export function OverlayModal({ open, onClose }: OverlayModalProps) {
  const { isMobile } = useResponsive();
  const { overlays } = useProjectStore();

  // Default selection to watermark on open
  const [selectedId, setSelectedId] = useState<string | null>(
    overlays[0]?.id ?? null,
  );

  // Reset selection when modal opens
  React.useEffect(() => {
    if (open) setSelectedId(overlays[0]?.id ?? null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className={
          isMobile
            ? 'w-full h-[90dvh] max-w-none rounded-t-2xl rounded-b-none p-0 gap-0 flex flex-col bottom-0 top-auto translate-y-0 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom border-border/50'
            : 'max-w-[1330px] sm:max-w-[1330px] h-[780px] p-0 gap-0 flex flex-col rounded-2xl border-border/50'
        }
        // Hide default close button — we render our own
        hideCloseButton
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
          <DialogTitle className="text-sm font-semibold">Video Overlays</DialogTitle>
          <IconButton variant="toolbar" size="sm" onClick={onClose} title="Close">
            <X size={16} />
          </IconButton>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {isMobile
            ? <MobileLayout selectedId={selectedId} setSelectedId={setSelectedId} />
            : <DesktopLayout selectedId={selectedId} setSelectedId={setSelectedId} />
          }
        </div>
      </DialogContent>
    </Dialog>
  );
}
