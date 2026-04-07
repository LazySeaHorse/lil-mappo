import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  "inline-flex items-center justify-center shrink-0 rounded-lg transition-all outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        ghost:
          "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        toolbar:
          "text-foreground hover:text-primary hover:bg-primary/5",
        "toolbar-active":
          "text-primary bg-primary/10 scale-110 shadow-lg",
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground",
        destructive:
          "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
        zen:
          "rounded-full shadow-2xl backdrop-blur-xl bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white border-none hover:scale-110 active:scale-95",
      },
      size: {
        xs: "h-6 w-6 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 w-8 [&_svg:not([class*='size-'])]:size-4",
        default: "h-9 w-9 [&_svg:not([class*='size-'])]:size-[18px]",
        lg: "h-10 w-10 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "sm",
    },
  }
);

interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, loading, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        data-slot="icon-button"
        className={cn(iconButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" /> : children}
      </Comp>
    );
  }
);
IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants };
export type { IconButtonProps };
