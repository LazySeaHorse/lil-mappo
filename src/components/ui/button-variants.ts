import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        /** A ghost button with muted text, for secondary actions like "Clear" or "Skip". */
        subtle: "text-muted-foreground hover:bg-accent hover:text-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        /** A quiet destructive action, e.g. "Cancel plan" beside its explanation. */
        "destructive-ghost": "text-destructive hover:bg-destructive/10 hover:text-destructive",
        /** The pressed "I'd like this" vote. */
        wish: "border border-wish/45 bg-wish/10 text-foreground hover:bg-wish/15",
      },
      // Text steps with height: the dense editor sizes use text-xs, popup and call-to-action sizes text-sm.
      size: {
        xs: "h-7 gap-1 px-2.5 text-xs has-[>svg]:px-2",
        sm: "h-8 gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        default: "h-9 px-4 text-xs has-[>svg]:px-3",
        lg: "h-10 rounded-[10px] px-4 text-sm has-[>svg]:px-3.5",
        xl: "h-11 rounded-[10px] px-6 text-sm has-[>svg]:px-5",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
