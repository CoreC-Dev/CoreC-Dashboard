import { useState } from 'react'

/**
 * Shared list-page CRUD state for entity admin pages.
 *
 * Extracted from 3 near-identical handleCreate/Edit/Delete/confirmDelete
 * patterns in DriversPage, TransportsPage, and RulesPage (TD-DUP-005).
 *
 * The hook manages wizard-open, editing-entity, and delete-target state.
 * The caller provides entity-specific find/remove/resetToEmpty functions.
 */
interface UseEntityListPageOptions<T> {
  /** Find an entity by name in the config store. */
  find: (name: string) => T | undefined
  /** Remove an entity by name from the config store. */
  remove: (name: string) => void
  /** Reset the working config to an empty document. */
  resetToEmpty: () => void
  /** Whether a working config currently exists. */
  hasWorkingConfig: boolean
}

export function useEntityListPage<T>(options: UseEntityListPageOptions<T>) {
  const { find, remove, resetToEmpty, hasWorkingConfig } = options
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState<T | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const handleCreate = () => {
    if (!hasWorkingConfig) resetToEmpty()
    setEditing(undefined)
    setWizardOpen(true)
  }

  const handleEdit = (name: string) => {
    const entity = find(name)
    if (!entity) return
    setEditing(entity)
    setWizardOpen(true)
  }

  const handleDelete = (name: string) => {
    setDeleteTarget(name)
  }

  const confirmDelete = () => {
    if (deleteTarget) {
      remove(deleteTarget)
      setDeleteTarget(null)
    }
  }

  return {
    wizardOpen,
    setWizardOpen,
    editing,
    deleteTarget,
    setDeleteTarget,
    handleCreate,
    handleEdit,
    handleDelete,
    confirmDelete,
  }
}
