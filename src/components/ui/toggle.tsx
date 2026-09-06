"use client";

import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { toggleVariants } from './toggle-variants';

const Toggle = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <TogglePrimitive.Root
        ref={ref}
        data-slot="toggle"
        className={cn(toggleVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Toggle.displayName = "Toggle";

export { Toggle };
