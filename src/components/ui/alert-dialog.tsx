"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { popupSurfaceVariants, popupTextClass, popupTitleClass } from "./popup-variants";
import { buttonVariants } from './button-variants';
import { computeOriginTransform } from "@/lib/clickOrigin";

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Overlay
      ref={ref}
      data-slot="alert-dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/40 duration-200 ease-out",
        className,
      )}
      {...props}
    />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

/** Defaults to the sm popup width: alert dialogs are confirmations. */
function AlertDialogContent({
  className,
  style,
  size = "sm",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & VariantProps<typeof popupSurfaceVariants>) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const origin = computeOriginTransform(el);
    el.style.transformOrigin = origin;
  }, []);

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <div className="fixed inset-0 z-overlay flex items-center justify-center p-4 pointer-events-none">
        <AlertDialogPrimitive.Content
          ref={contentRef}
          data-slot="alert-dialog-content"
          className={cn(
            popupSurfaceVariants({ size }),
            className,
          )}
          style={{
            transformOrigin: "center",
            ...style,
          }}
          {...props}
        />
      </div>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      data-ph-unmask
      className={cn(popupTitleClass, className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      data-ph-unmask
      className={cn(popupTextClass, className)}
      {...props}
    />
  );
}

type ButtonStyleProps = VariantProps<typeof buttonVariants>;

/** Popup buttons default to size lg, like every other popup action. */
function AlertDialogAction({
  className,
  variant,
  size = "lg",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & ButtonStyleProps) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "lg",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> & ButtonStyleProps) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
