"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "group toast relative flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-xl bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white border border-white/20 dark:border-slate-800/50 transition-all duration-300 max-w-md whitespace-nowrap",
          title: "text-center",
          description: "text-center opacity-70",
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
