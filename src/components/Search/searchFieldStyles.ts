/**
 * The look of every search box: a visible border and a solid background in light and dark
 * themes, and room on the right for `SearchFieldActions`. Each field adds its own height.
 */
export const SEARCH_INPUT_CLASS =
  'w-full min-w-0 rounded-lg border border-foreground/25 bg-background pl-2.5 pr-14 text-sm outline-none transition-[color,box-shadow,border-color] ' +
  'placeholder:text-muted-foreground hover:border-foreground/40 dark:bg-input/30 ' +
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';
