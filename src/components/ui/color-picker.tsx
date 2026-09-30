import * as React from "react";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "@/lib/utils";

export const DEFAULT_COLOR_PRESETS = [
  "#3b82f6", // Blue
  "#22c55e", // Green
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#8b5cf6", // Purple
  "#ffffff", // White
] as const;

export function normalizeHex(hex: string): string {
  if (!hex) return "";
  let trimmed = hex.trim();
  if (!trimmed.startsWith("#")) {
    trimmed = `#${trimmed}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed.toLowerCase();
}

export function isValidHex(hex: string): boolean {
  if (!hex) return false;
  let trimmed = hex.trim();
  if (!trimmed.startsWith("#")) {
    trimmed = `#${trimmed}`;
  }
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed);
}

export interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  presets?: readonly string[] | string[];
  className?: string;
  swatchClassName?: string;
}

/**
 * Color picker featuring preset swatches, active state tracking, a rainbow wheel button,
 * and a full color picker popover with spectrum picker and manual hex input.
 * When constrained for space, controls wrap cleanly into two rows.
 */
export function ColorPicker({
  value,
  onChange,
  presets = DEFAULT_COLOR_PRESETS,
  className,
  swatchClassName,
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [hexInput, setHexInput] = React.useState(value || "");

  React.useEffect(() => {
    setHexInput(value || "");
  }, [value]);

  const normalizedValue = normalizeHex(value);
  const isPresetSelected = presets.some(
    (preset) => normalizeHex(preset) === normalizedValue
  );

  const handleHexChange = (input: string) => {
    setHexInput(input);
    const trimmed = input.trim();
    if (isValidHex(trimmed)) {
      onChange(normalizeHex(trimmed));
    }
  };

  const handleHexBlur = () => {
    const trimmed = hexInput.trim();
    if (isValidHex(trimmed)) {
      const normalized = normalizeHex(trimmed);
      setHexInput(normalized);
      onChange(normalized);
    } else {
      setHexInput(value || "");
    }
  };

  const handleSpectrumChange = (newColor: string) => {
    setHexInput(newColor);
    onChange(newColor);
  };

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      data-slot="color-picker"
    >
      {/* Preset color swatches */}
      {presets.map((preset) => {
        const isSelected = normalizeHex(preset) === normalizedValue;
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={cn(
              "relative w-5 h-5 rounded-full shrink-0 border border-black/15 dark:border-white/20 shadow-xs transition-all hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
              isSelected &&
                "ring-2 ring-primary ring-offset-1.5 ring-offset-background scale-105",
              swatchClassName
            )}
            style={{ backgroundColor: preset }}
            title={preset}
            aria-label={`Select color ${preset}`}
            aria-pressed={isSelected}
          />
        );
      })}

      {/* If current value is a custom color (not in presets), show it as an active swatch */}
      {!isPresetSelected && isValidHex(value) && (
        <button
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            "relative w-5 h-5 rounded-full shrink-0 border border-black/15 dark:border-white/20 shadow-xs ring-2 ring-primary ring-offset-1.5 ring-offset-background scale-105 transition-all hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
            swatchClassName
          )}
          style={{ backgroundColor: value }}
          title={`Custom color: ${value}`}
          aria-label={`Custom color ${value}`}
          aria-pressed={true}
        />
      )}

      {/* Rainbow wheel button to open full color picker + hex entry popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "relative w-5 h-5 rounded-full shrink-0 border border-black/15 dark:border-white/20 shadow-xs hover:scale-110 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
              isOpen &&
                "ring-2 ring-primary ring-offset-1.5 ring-offset-background scale-105",
              swatchClassName
            )}
            style={{
              background:
                "conic-gradient(from 180deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
            }}
            title="More colors"
            aria-label="More colors"
          />
        </PopoverTrigger>
        <PopoverContent
          className="w-56 p-3 rounded-xl border border-border/60 bg-popover shadow-xl z-50"
          align="end"
          side="bottom"
          sideOffset={6}
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Custom Color
              </span>
              <span className="text-[11px] font-mono text-muted-foreground uppercase">
                {normalizeHex(value) || value}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="relative shrink-0 w-8 h-8 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] border border-white/20 dark:border-white/10 overflow-hidden cursor-pointer ring-1 ring-border/50 hover:scale-105 transition-transform"
                style={{ backgroundColor: isValidHex(value) ? value : "#000000" }}
                title="Open color spectrum"
              >
                <input
                  type="color"
                  value={isValidHex(value) ? normalizeHex(value) : "#000000"}
                  onChange={(e) => handleSpectrumChange(e.target.value)}
                  className="opacity-0 absolute -inset-2 w-12 h-12 cursor-pointer"
                  aria-label="Color spectrum picker"
                />
              </div>
              <Input
                type="text"
                value={hexInput}
                onChange={(e) => handleHexChange(e.target.value)}
                onBlur={handleHexBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleHexBlur();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="#000000"
                maxLength={7}
                className="flex-1 h-8 font-mono text-xs uppercase tracking-wider bg-background/50 focus-visible:ring-1 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
                aria-label="Hex color value"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
