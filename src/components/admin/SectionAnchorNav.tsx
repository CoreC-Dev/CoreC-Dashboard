/**
 * SectionAnchorNav — the jump-chips row that gives a long stacked page
 * an in-page table of contents (C-E1). Buttons scroll to section
 * anchors via scrollIntoView — never href="#…" (the app runs on a
 * HashRouter, where a plain hash link would clobber the route).
 */
import type React from 'react'
import { useTranslation } from 'react-i18next'

export interface AnchorSection {
  /** DOM id of the section wrapper (scroll target). */
  id: string
  /** i18n key for the chip label. */
  labelKey: string
}

export const SectionAnchorNav: React.FC<{ sections: readonly AnchorSection[] }> = ({
  sections,
}) => {
  const { t } = useTranslation()
  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <nav
      aria-label={t('diagnostics.navAriaLabel')}
      data-testid="section-anchor-nav"
      className="flex flex-wrap items-center gap-1.5"
    >
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => jump(s.id)}
          className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {t(s.labelKey)}
        </button>
      ))}
    </nav>
  )
}
