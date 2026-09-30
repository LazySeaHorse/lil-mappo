/**
 * ContentFields — the text, number and image fields a callout style consumes.
 *
 * Driven by the style's `contentSlots`; the title is edited by EditableTitle.
 * Values for slots the current style does not consume stay in the content
 * (they are only hidden), and clearing a field removes its key.
 */

import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Replace, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import type { AnnotationContent, AnnotationStyleDefinition } from '@/annotations/types';
import { imageFileToDataUrl } from '@/utils/imageDownscale';

type TextSlot = 'eyebrow' | 'subtitle' | 'badge';

const TEXT_FIELDS: Record<TextSlot, { label: string; placeholder: string; maxLength: number }> = {
  eyebrow: { label: 'Eyebrow', placeholder: 'Small line above the title', maxLength: 100 },
  subtitle: { label: 'Subtitle', placeholder: 'Secondary line', maxLength: 300 },
  badge: { label: 'Badge', placeholder: 'e.g. Day 3', maxLength: 60 },
};

/** Top-to-bottom order the fields appear in, whatever order the style lists its slots. */
const SLOT_ORDER: Array<keyof AnnotationContent> = ['eyebrow', 'subtitle', 'body', 'badge', 'metric', 'image'];

const INPUT_CLASS = 'h-8 text-xs';

/** Content with `key` set, or removed when the value is empty. */
function withSlot<K extends keyof AnnotationContent>(
  content: AnnotationContent,
  key: K,
  value: AnnotationContent[K] | '' | undefined,
): AnnotationContent {
  const { [key]: _removed, ...rest } = content;
  void _removed;
  return (value === undefined || value === '' ? rest : { ...rest, [key]: value }) as AnnotationContent;
}

function MetricFields({ content, onChange }: { content: AnnotationContent; onChange: (c: AnnotationContent) => void }) {
  const metric = content.metric;
  const [draft, setDraft] = useState(metric ? String(metric.value) : '');

  // Follow outside changes (undo, agent edits) without fighting what is being typed.
  useEffect(() => {
    setDraft((d) => {
      if (!metric) return d.trim() === '' || !Number.isFinite(Number(d)) ? d : '';
      return Number(d) === metric.value && d.trim() !== '' ? d : String(metric.value);
    });
  }, [metric]);

  const commitValue = (text: string) => {
    setDraft(text);
    const value = Number(text);
    if (text.trim() === '' || !Number.isFinite(value)) {
      onChange(withSlot(content, 'metric', undefined));
    } else {
      onChange({ ...content, metric: { ...metric, value } });
    }
  };

  const setDetail = (key: 'unit' | 'label', text: string) => {
    if (!metric) return;
    const { [key]: _removed, ...rest } = metric;
    void _removed;
    onChange({ ...content, metric: text === '' ? rest : { ...rest, [key]: text } });
  };

  return (
    <Field label="Number">
      <div className="flex flex-col gap-2">
        <Input
          type="number"
          aria-label="Number value"
          value={draft}
          onChange={(e) => commitValue(e.target.value)}
          placeholder="e.g. 42"
          className={cn(INPUT_CLASS, 'font-mono')}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="text"
            aria-label="Number unit"
            value={metric?.unit ?? ''}
            onChange={(e) => setDetail('unit', e.target.value)}
            placeholder="Unit (km)"
            maxLength={20}
            disabled={!metric}
            className={INPUT_CLASS}
          />
          <Input
            type="text"
            aria-label="Number label"
            value={metric?.label ?? ''}
            onChange={(e) => setDetail('label', e.target.value)}
            placeholder="Label (distance)"
            maxLength={60}
            disabled={!metric}
            className={INPUT_CLASS}
          />
        </div>
      </div>
    </Field>
  );
}

function ImageField({ value, onChange }: { value?: string; onChange: (image: string | undefined) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await imageFileToDataUrl(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That image could not be added.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label="Image">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label="Image file"
        className="hidden"
        onChange={(e) => {
          void load(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {value ? (
        <div className="flex items-center gap-2.5">
          <img src={value} alt="Callout image" className="h-14 w-14 rounded-md border border-border/50 object-cover" />
          <div className="flex flex-col gap-1.5">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()} className="h-7 text-xs gap-1.5">
              <Replace size={13} /> Replace
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)} className="h-7 text-xs gap-1.5 text-muted-foreground">
              <Trash2 size={13} /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="image-dropzone"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void load(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/60 py-4 text-xs text-muted-foreground transition-colors hover:bg-secondary/50',
            dragging && 'border-primary bg-primary/5 text-primary',
          )}
        >
          <ImagePlus size={16} />
          <span>{busy ? 'Processing...' : 'Choose or drop an image'}</span>
        </button>
      )}
    </Field>
  );
}

/** Placeholder for a text slot: the eyebrow says so when the style fills it with coordinates. */
function placeholderFor(slot: TextSlot, eyebrowFallback: AnnotationStyleDefinition['eyebrowFallback']): string {
  return slot === 'eyebrow' && eyebrowFallback === 'coordinates' ? 'Defaults to coordinates' : TEXT_FIELDS[slot].placeholder;
}

export function ContentFields({
  content,
  slots,
  eyebrowFallback,
  onChange,
}: {
  content: AnnotationContent;
  slots: ReadonlyArray<keyof AnnotationContent>;
  eyebrowFallback?: AnnotationStyleDefinition['eyebrowFallback'];
  onChange: (content: AnnotationContent) => void;
}) {
  const shown = SLOT_ORDER.filter((slot) => slots.includes(slot));
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-col">
      {shown.map((slot) => {
        switch (slot) {
          case 'eyebrow':
          case 'subtitle':
          case 'badge': {
            const { label, maxLength } = TEXT_FIELDS[slot];
            return (
              <Field key={slot} label={label}>
                <Input
                  type="text"
                  aria-label={label}
                  value={content[slot] ?? ''}
                  onChange={(e) => onChange(withSlot(content, slot, e.target.value))}
                  placeholder={placeholderFor(slot, eyebrowFallback)}
                  maxLength={maxLength}
                  className={INPUT_CLASS}
                />
              </Field>
            );
          }
          case 'body':
            return (
              <Field key={slot} label="Body">
                <Textarea
                  aria-label="Body"
                  value={content.body ?? ''}
                  onChange={(e) => onChange(withSlot(content, 'body', e.target.value))}
                  placeholder="Longer text"
                  maxLength={1000}
                  rows={3}
                  className="min-h-16 text-xs md:text-xs"
                />
              </Field>
            );
          case 'metric':
            return <MetricFields key={slot} content={content} onChange={onChange} />;
          case 'image':
            return <ImageField key={slot} value={content.image} onChange={(image) => onChange(withSlot(content, 'image', image))} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
