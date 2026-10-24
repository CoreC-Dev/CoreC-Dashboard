/**
 * Write-page dead-letter narrowing.
 *
 * The DLQ caps its rendered rows at 100; without search/filter an entry
 * beyond the cap is unreachable. This pure predicate narrows the visible
 * set by free text (tag name / verbatim error) and by driver so the cap
 * applies to what the operator actually asked to see. (The alerts page
 * solves the same problem with its own filter.)
 */
import type { DeadLetterEntry } from '@/types/models'

export const filterWriteDeadLetters = (
  entries: DeadLetterEntry[],
  term: string,
  driver: string,
): DeadLetterEntry[] => {
  const q = term.trim().toLowerCase()
  return entries.filter((dl) => {
    if (driver !== 'all' && dl.command.driver !== driver) return false
    if (!q) return true
    return `${dl.command.tag} ${dl.error}`.toLowerCase().includes(q)
  })
}
