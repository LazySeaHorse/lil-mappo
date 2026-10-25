/**
 * The look of every search box: a visible border and a solid background in light and dark
 * themes, and room on the right for `SearchFieldActions`. Each field adds its own height.
 */
export const SEARCH_INPUT_CLASS =
  'w-full min-w-0 rounded-lg border border-foreground/25 bg-background pl-2.5 pr-14 text-sm outline-none transition-[color,box-shadow,border-color] ' +
  'placeholder:text-muted-foreground hover:border-foreground/40 dark:bg-input/30 ' +
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The box of a search field that holds place pills. It looks like `SEARCH_INPUT_CLASS` and wraps
 * the pills and the bare text input, which sits on the same line until the pills fill it.
 */
export const SEARCH_BOX_CLASS =
  'flex w-full min-w-0 flex-wrap items-center gap-1 rounded-lg border border-foreground/25 bg-background py-1 pl-1.5 pr-14 text-sm transition-[color,box-shadow,border-color] ' +
  'hover:border-foreground/40 dark:bg-input/30 ' +
  'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50';

/** Turns the input of a field into the bare text input inside a `SEARCH_BOX_CLASS` box. */
export const SEARCH_BARE_INPUT_CLASS =
  'h-6 min-w-[7rem] flex-1 border-0 bg-transparent p-0 pl-1 shadow-none focus-visible:ring-0 hover:border-0 focus-visible:border-0 dark:bg-transparent';
