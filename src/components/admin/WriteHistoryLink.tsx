/**
 * Link from the write-control surfaces to the diagnostics page's
 * write-history section — the audit trail of what actually reached the
 * PLC. The write page previously had no way to verify a completed write;
 * this link appears beside the success message and under the dead-letter
 * card description, deep-linking the?section=writes anchor.
 */
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

export const WriteHistoryLink: React.FC = () => {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const base = id ? `/corec/${id}/admin` : '/admin'
  return (
    <Link
      to={`${base}/diagnostics?section=writes`}
      className="font-medium text-primary hover:underline"
    >
      {t('write.viewHistory')}
    </Link>
  )
}
