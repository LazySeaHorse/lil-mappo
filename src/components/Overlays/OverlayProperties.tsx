import React, { useRef } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import type { VideoOverlay } from '@/store/types';
import { MAP_FONTS } from '@/constants/fonts';
import { Field, SectionLabel, SwitchField } from '@/components/ui/field';
import { ColorPicker } from '@/components/ui/color-picker';
import { ProBadge } from '@/components/ui/pro-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MAX_IMAGE_BYTES = 500 * 1024; // 500 KB

interface OverlayPropertiesProps {
  overlay: VideoOverlay;
}

export function OverlayProperties({ overlay }: OverlayPropertiesProps) {
  const { updateOverlay, removeOverlay } = useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isWatermark = overlay.kind === 'watermark';

  const u = (updates: Partial<VideoOverlay>) => updateOverlay(overlay.id, updates);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`Image too large (${(file.size / 1024).toFixed(0)} KB). Maximum is 500 KB.`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        u({ imageDataUrl: ev.target.result });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto gap-0" style={{ scrollbarWidth: 'none' }}>

      {/* ── Watermark ─────────────────────────────────────────────────── */}
      {isWatermark && (
        <>
          <SectionLabel>Watermark</SectionLabel>
          <div className="flex items-center justify-between px-1 mb-3">
            <SwitchField
              label="Show Watermark"
              checked={overlay.enabled}
              onChange={(v) => u({ enabled: v })}
            />
            <ProBadge className="ml-2 shrink-0" />
          </div>
          <p className="text-[10px] text-muted-foreground/60 px-1 mb-4 leading-relaxed">
            The li'l Mappo watermark is shown on all exported videos. Disabling it will be a Pro feature.
          </p>
        </>
      )}

      {/* ── Visibility (non-watermark) ─────────────────────────────────── */}
      {!isWatermark && (
        <>
          <SectionLabel>Visibility</SectionLabel>
          <div className="mb-3 px-1">
            <SwitchField
              label="Visible"
              checked={overlay.enabled}
              onChange={(v) => u({ enabled: v })}
            />
          </div>
        </>
      )}

      {/* ── Opacity (text + image only) ────────────────────────────────────────── */}
      {!isWatermark && (
        <>
          <SectionLabel>Opacity</SectionLabel>
          <div className="mb-4 px-1">
            <div className="flex items-center gap-3">
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[overlay.opacity]}
                onValueChange={([v]) => u({ opacity: v })}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right shrink-0">
                {Math.round(overlay.opacity * 100)}%
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Text / Watermark content ──────────────────────────────────── */}
      {overlay.kind === 'text' && (
        <>
          <SectionLabel>Text</SectionLabel>

          <Field label="Content">
            <Input
              value={overlay.text ?? ''}
              onChange={(e) => u({ text: e.target.value })}
              placeholder="Enter text..."
              className="h-8 text-xs bg-background/50"
            />
          </Field>

          <Field label="Font Family">
            <Select value={overlay.fontFamily ?? 'Outfit'} onValueChange={(v) => u({ fontFamily: v })}>
              <SelectTrigger className="h-8 text-sm w-full">
                <span style={{ fontFamily: overlay.fontFamily ?? 'Outfit' }}>
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {MAP_FONTS.map((f) => (
                  <SelectItem key={f} value={f}>
                    <span style={{ fontFamily: f }}>{f}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Weight">
            <Select
              value={overlay.fontWeight ?? 'bold'}
              onValueChange={(v) => u({ fontWeight: v as 'normal' | 'bold' })}
            >
              <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Size (px at 1080p)">
            <div className="flex items-center gap-3">
              <Slider
                min={10}
                max={120}
                step={1}
                value={[overlay.fontSize ?? 32]}
                onValueChange={([v]) => u({ fontSize: v })}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right shrink-0">
                {overlay.fontSize ?? 32}
              </span>
            </div>
          </Field>

          <Field label="Color">
            <ColorPicker
              value={overlay.color ?? '#ffffff'}
              onChange={(v) => u({ color: v })}
            />
          </Field>
        </>
      )}

      {/* ── Image upload ──────────────────────────────────────────────── */}
      {overlay.kind === 'image' && (
        <>
          <SectionLabel>Image</SectionLabel>
          <div className="mb-4 px-1 space-y-2">
            {overlay.imageDataUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-border/40 bg-secondary/30">
                <img
                  src={overlay.imageDataUrl}
                  alt="Overlay preview"
                  className="w-full h-24 object-contain"
                />
                <button
                  className="absolute top-1 right-1 bg-background/80 rounded-lg p-1 hover:bg-destructive/20 transition-colors"
                  onClick={() => u({ imageDataUrl: undefined })}
                  title="Remove image"
                >
                  <Trash2 size={12} className="text-destructive" />
                </button>
              </div>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1.5 rounded-xl"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={12} />
              {overlay.imageDataUrl ? 'Replace Image' : 'Upload Image'}
            </Button>
            <p className="text-[10px] text-muted-foreground/50 text-center">Max 500 KB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </div>
        </>
      )}

      {/* ── Delete (non-watermark) ────────────────────────────────────── */}
      {!isWatermark && (
        <div className="mt-auto pt-3 border-t border-border/40 px-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 rounded-xl"
            onClick={() => removeOverlay(overlay.id)}
          >
            <Trash2 size={12} />
            Remove Overlay
          </Button>
        </div>
      )}
    </div>
  );
}
