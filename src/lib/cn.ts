import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind class names — clsx (conditional) + tailwind-merge (dedupe).
 * 与 lib/utils 分开，保持零 `@/` 导入。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
