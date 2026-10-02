import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind class names — clsx (conditional) + tailwind-merge (dedupe).
 * Pure: zero `@/` imports. Extracted from lib/utils to decouple UI primitives
 * from i18n (TD-ARCH-004).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
