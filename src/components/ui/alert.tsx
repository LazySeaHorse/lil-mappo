import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-xl border grid has-[>svg]:grid-cols-[auto_1fr] grid-cols-[0_1fr] gap-y-0.5 items-start leading-relaxed [&>svg]:shrink-0 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
        // A sentence on a light tint; the icon carries the tone.
        info: "border-primary/15 bg-primary/5 [&>svg]:text-primary",
        warning: "border-warning/20 bg-warning/5 [&>svg]:text-warning",
      },
      size: {
        default: "px-3.5 py-3 text-sm has-[>svg]:gap-x-2.5 [&>svg]:size-4 [&>svg]:translate-y-[3px]",
        sm: "p-3 text-xs has-[>svg]:gap-x-2.5 [&>svg]:size-3.5 [&>svg]:translate-y-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Alert({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      // Only errors interrupt a screen reader; info and warning notes are static.
      role={variant === "destructive" ? "alert" : "note"}
      className={cn(alertVariants({ variant, size }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-muted-foreground col-start-2 grid justify-items-start gap-1 [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
