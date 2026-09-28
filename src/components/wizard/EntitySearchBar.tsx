/**
 * EntitySearchBar
 *
 * A compact search input for filtering entity lists (drivers, transports,
 * rules). Used by the admin pages to let operators quickly find a specific
 * entity by name or type when the list grows long.
 *
 * The search is case-insensitive and matches against name AND type. The
 * parent component receives the query string and applies its own filter
 * logic — this component is purely presentational + state holder.
 */
import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'

export interface EntitySearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export const EntitySearchBar: React.FC<EntitySearchBarProps> = ({
  value,
  onChange,
  placeholder,
}) => {
  const { t } = useTranslation()
  return (
    <div className="relative flex-1 max-w-xs">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || t('common.search') || 'Search...'}
        className="h-8 text-xs pl-8 pr-7"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/**
 * Filters an array of entities by a search query. Matches case-insensitively
 * against the entity's `name` and `type` fields.
 */
export function filterEntities<T extends { name: string; type?: string }>(
  entities: T[],
  query: string,
): T[] {
  if (!query.trim()) return entities
  const q = query.trim().toLowerCase()
  return entities.filter(
    (e) => e.name.toLowerCase().includes(q) || (e.type ?? '').toLowerCase().includes(q),
  )
}
