import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** An error's message, or `fallback` (default: the value as a string) when it is not an Error. */
export function errorMessage(err: unknown, fallback?: string): string {
  if (err instanceof Error) return err.message;
  return fallback ?? String(err);
}
