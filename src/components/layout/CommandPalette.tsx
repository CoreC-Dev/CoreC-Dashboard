import { Cpu, Search, Send } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useDrivers, useTransports } from '@/api/hooks'
import { buildAdminGroups, buildMonitorItems } from '@/components/layout/navItems'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import { useUiStore } from '@/stores/uiStore'

interface PaletteEntry {
  key: string
  label: string
  hint?: string
  group: string
  icon: React.ComponentType<{ className?: string }>
  run: () => void
}

/**
 * ⌘K / Ctrl-K command palette — jumps to any monitor/admin page, or to a
 * driver/transport detail page, without hunting through the sidebar or a
 * list page. Mounted inside the instance route tree so its data hooks share
 * the instance QueryClient.
 */
export const CommandPalette: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id: instanceId } = useParams<{ id: string }>()
  const open = useUiStore((s) => s.commandOpen)
  const setOpen = useUiStore((s) => s.setCommandOpen)

  const { data: driversData } = useDrivers()
  const { data: transportsData } = useTransports()

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useUiStore.getState().commandOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const entries = useMemo<PaletteEntry[]>(() => {
    const base = instanceId ? `/corec/${instanceId}` : ''
    const pages = [...buildMonitorItems(base), ...buildAdminGroups(base).flatMap((g) => g.items)]
    const list: PaletteEntry[] = pages.map((item) => ({
      key: item.path,
      label: t(item.labelKey),
      group: t('command.pages'),
      icon: item.icon,
      run: () => {
        navigate(item.path)
        setOpen(false)
      },
    }))
    for (const driver of driversData?.drivers ?? []) {
      list.push({
        key: `driver:${driver.name}`,
        label: driver.name,
        hint: driver.type,
        group: t('command.drivers'),
        icon: Cpu,
        run: () => {
          navigate(`${base}/admin/drivers/${encodeURIComponent(driver.name)}`)
          setOpen(false)
        },
      })
    }
    for (const transport of transportsData?.transports ?? []) {
      list.push({
        key: `transport:${transport.name}`,
        label: transport.name,
        hint: transport.type,
        group: t('command.transports'),
        icon: Send,
        run: () => {
          navigate(`${base}/admin/transports/${encodeURIComponent(transport.name)}`)
          setOpen(false)
        },
      })
    }
    return list
  }, [driversData, instanceId, navigate, setOpen, t, transportsData])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? entries.filter(
          (e) =>
            e.label.toLowerCase().includes(q) ||
            e.hint?.toLowerCase().includes(q) ||
            e.group.toLowerCase().includes(q),
        )
      : entries
    return filtered.slice(0, 12)
  }, [entries, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  const runAt = (index: number) => {
    const entry = results[index]
    if (entry) entry.run()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('command.title')}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4 pr-10">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            // biome-ignore lint/a11y/noAutofocus: the palette is only mounted while open, and the input is its whole point.
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => (i + 1) % Math.max(results.length, 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => (i - 1 + results.length) % Math.max(results.length, 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                runAt(active)
              }
            }}
            placeholder={t('command.placeholder')}
            aria-label={t('command.placeholder')}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>

        <div className="max-h-[22rem] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t('command.empty')}
            </div>
          ) : (
            results.map((entry, index) => {
              const Icon = entry.icon
              return (
                <button
                  key={entry.key}
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runAt(index)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    index === active ? 'bg-muted text-foreground' : 'text-foreground/90',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{entry.label}</span>
                  {entry.hint && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {entry.hint}
                    </span>
                  )}
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">
                    {entry.group}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span className="truncate">{t('command.hint')}</span>
          <span className="shrink-0 font-mono">⌘K</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
