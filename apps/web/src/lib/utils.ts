import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/** Joins class names and lets later Tailwind utilities override conflicting earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
