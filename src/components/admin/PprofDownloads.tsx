/**
 * PprofDownloads — the "Advanced debugging" tail section of the
 * diagnostics page (C-E1).
 *
 * pprof profiles (heap/goroutine/CPU/block/mutex/trace) are CoreC
 * developer tools, not operator surfaces; the page previously dumped
 * them into the operator's scrolling path. The section now ships
 * COLLAPSED by default so the operator's page ends at the write
 * history, and developers expand it when a Go-side investigation
 * actually needs a profile.
 *
 * Downloads fetch through the same-origin proxy with the Bearer header
 * (pprof mounts inside CoreC's authed route group) and carry a 30s
 * abort — see TD-SEC-001/002 and TD-PERF-002 in the original page.
 */
import { AlertCircle, ChevronDown, Download, RefreshCw } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getActiveConnection } from '@/api/activeConnection'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/cn'

const PPROF_PROFILES = [
  'heap',
  'goroutine',
  'profile?seconds=5',
  'trace?seconds=5',
  'block',
  'mutex',
] as const

export const PprofDownloads: React.FC = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pprofLoading, setPprofLoading] = useState<string | null>(null)
  const [pprofError, setPprofError] = useState<string | null>(null)

  // Fetch a pprof profile with the Bearer auth header and trigger a local
  // download. Direct <a href> links would receive a 401 because pprof is
  // mounted inside CoreC's authed route group.
  const downloadPprof = async (profile: string) => {
    const conn = getActiveConnection()
    const baseUrl = conn?.baseUrl ?? ''
    const secret = conn?.secret ?? ''
    const cleanBase = baseUrl.trim().replace(/\/+$/, '')
    // Route through same-origin proxy (TD-SEC-001/002, D3).
    const url = `/corec-proxy/debug/pprof/${profile}`
    setPprofLoading(profile)
    setPprofError(null)
    try {
      // Add 30s timeout — pprof profiles can block server-side for seconds
      // but should not hang forever (TD-PERF-002).
      const ctrl = new AbortController()
      const timeoutId = setTimeout(() => ctrl.abort(), 30_000)
      const res = await fetch(url, {
        headers: {
          'X-CoreC-Target': cleanBase,
          Authorization: `Bearer ${secret}`,
        },
        signal: ctrl.signal,
      })
      clearTimeout(timeoutId)
      if (!res.ok) {
        throw new Error(
          t('diagnostics.httpError', { status: res.status, statusText: res.statusText }),
        )
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      const baseName = profile.split('?')[0].replace(/\/+$/, '')
      a.download = `pprof_${baseName.replace(/\//g, '_')}.pb.gz`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('pprof download failed', e)
      setPprofError(t('diagnostics.pprofFetchFailed', { profile, error: msg }))
    } finally {
      setPprofLoading(null)
    }
  }

  return (
    <section id="diagnostics-advanced" className="scroll-mt-24">
      <Card className="border-border bg-card">
        <CardHeader
          className="flex cursor-pointer select-none flex-row items-center justify-between space-y-0"
          onClick={() => setOpen((o) => !o)}
        >
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">
              {t('diagnostics.advancedDebugging')}
            </CardTitle>
            <CardDescription className="text-xs">{t('diagnostics.pprofDesc')}</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((o) => !o)
            }}
            aria-label={t('diagnostics.advancedToggle')}
            aria-expanded={open}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </Button>
        </CardHeader>
        {open && (
          <CardContent className="p-4 pt-0">
            {pprofError && (
              <div className="mb-3 p-2.5 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-xs flex items-start space-x-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="break-all">{pprofError}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              {PPROF_PROFILES.map((p) => {
                const loading = pprofLoading === p
                return (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    disabled={pprofLoading !== null}
                    onClick={() => downloadPprof(p)}
                    className="h-8 px-3 font-mono text-xs"
                  >
                    {loading ? (
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5 mr-1.5 text-primary" />
                    )}
                    <span>/debug/pprof/{p}</span>
                  </Button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">{t('diagnostics.pprofFetchNote')}</p>
          </CardContent>
        )}
      </Card>
    </section>
  )
}
