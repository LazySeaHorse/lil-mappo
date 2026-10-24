import { cva } from 'class-variance-authority';

/**
 * The surface every DialogContent and AlertDialogContent uses. Popups open with a `PinDropHero` and put
 * their padding in `PopupBody`, so the surface itself has none. Its one grid column is `minmax(0, 1fr)`,
 * so content keeps to the popup width (an `auto` column grows to the widest unbreakable text and cuts off
 * the rest), and long words such as links wrap.
 */
export const popupSurfaceVariants = cva(
  'pointer-events-auto relative grid grid-cols-[minmax(0,1fr)] break-words w-full max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[18px] border border-border/60 bg-background p-0 shadow-2xl duration-200 ease-spring data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-90 data-[state=open]:zoom-in-90',
  {
    variants: {
      size: {
        /** Confirmations and short notices. */
        sm: 'sm:max-w-[420px]',
        md: 'sm:max-w-[540px]',
        /** Wide forms and plan tables. */
        lg: 'sm:max-w-[720px]',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export const popupTitleClass = 'text-xl font-semibold leading-tight tracking-[-0.015em] text-foreground';

export const popupTextClass = 'text-sm leading-relaxed text-muted-foreground';
