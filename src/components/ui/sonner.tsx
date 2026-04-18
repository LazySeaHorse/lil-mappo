"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-left"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "group toast relative flex items-center gap-3 rounded-2xl px-4 h-14 text-sm font-medium shadow-2xl shadow-black/10 backdrop-blur-xl bg-background/85 text-foreground border border-border/50 transition-all duration-300 w-auto max-w-[min(20rem,calc(100vw-2rem))]",
          title: "text-left leading-snug",
          description: "text-left opacity-70 text-xs",
        },
      }}
      icons={{
        success: null,
        error: null,
        info: null,
        warning: null,
      }}
      {...props}
    />
  );
};

export { Toaster };
