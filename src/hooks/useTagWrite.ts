import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWriteTag } from '@/api/hooks'
import { isNumericType } from '@/lib/tagExplorer'
import { validateValue } from '@/lib/writeValidation'
import type { DataPoint } from '@/types/models'

interface UseTagWriteResult {
  /** Tag currently targeted by the write dialog (null = dialog closed). */
  selectedTagForWrite: DataPoint | null
  /** Raw input value in the write dialog. */
  writeValue: string
  setWriteValue: React.Dispatch<React.SetStateAction<string>>
  /** Validation / submission error message, or null when clean. */
  writeError: string | null
  /** Whether a write mutation is in flight (disables the submit button). */
  isPending: boolean
  /** Open the write dialog for a tag, pre-filling its current value. */
  openWrite: (point: DataPoint) => void
  /** Close the write dialog without submitting. */
  closeWrite: () => void
  /** Validate + submit the write command (form onSubmit handler). */
  submitWrite: (e: React.FormEvent) => Promise<void>
}

/**
 * Write-command dialog state for TagExplorerPage.
 *
 * Owns the target tag, input value, and error state, and performs the
 * industrial-safety validation + typed parse + mutation. Extracted verbatim
 * from TagExplorerPage — no behavior change.
 */
export function useTagWrite(): UseTagWriteResult {
  const { t } = useTranslation()
  const writeMutation = useWriteTag()
  const [selectedTagForWrite, setSelectedTagForWrite] = useState<DataPoint | null>(null)
  const [writeValue, setWriteValue] = useState('')
  const [writeError, setWriteError] = useState<string | null>(null)

  const openWrite = useCallback((point: DataPoint) => {
    setSelectedTagForWrite(point)
    setWriteValue(String(point.value))
  }, [])

  const closeWrite = useCallback(() => {
    setSelectedTagForWrite(null)
  }, [])

  const submitWrite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTagForWrite) return
    setWriteError(null)

    // Industrial safety: validate the raw input against the tag's data type
    // BEFORE parsing or writing. This catches empty input (Number("") => 0),
    // non-numeric strings (NaN serializes to null in JSON), out-of-range
    // values, and ambiguous bool input — all of which previously wrote a
    // silently-coerced value to a physical actuator.
    const validationError = validateValue(writeValue, selectedTagForWrite.type, t)
    if (validationError) {
      setWriteError(validationError)
      return
    }

    let parsedVal: string | number | boolean = writeValue
    if (selectedTagForWrite.type === 'bool') {
      parsedVal = writeValue.toLowerCase() === 'true' || writeValue === '1'
    } else if (isNumericType(selectedTagForWrite.type)) {
      parsedVal = Number(writeValue)
    }

    try {
      await writeMutation.mutateAsync({
        driver: selectedTagForWrite.driver,
        tag: selectedTagForWrite.tag,
        device: selectedTagForWrite.device,
        value: parsedVal,
        type: selectedTagForWrite.type,
      })
      setSelectedTagForWrite(null)
      setWriteValue('')
    } catch (err: unknown) {
      setWriteError(err instanceof Error ? err.message : t('tags.writeFailed'))
    }
  }

  return {
    selectedTagForWrite,
    writeValue,
    setWriteValue,
    writeError,
    isPending: writeMutation.isPending,
    openWrite,
    closeWrite,
    submitWrite,
  }
}
