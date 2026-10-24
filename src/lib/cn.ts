import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind class names — clsx (conditional) + tailwind-merge (dedupe).
 * Pure: zero `@/` imports. Kept separate from lib/utils (which pulls in
 * i18n) so UI primitives can consume it without an i18n dependency.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
