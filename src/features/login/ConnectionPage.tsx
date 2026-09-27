import { AlertCircle, ArrowRight, Lock, Radio, Server } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useConnectionStore } from '@/stores/connectionStore'

export const ConnectionPage: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { baseUrl, secret, setConnection, setConnected, setError } = useConnectionStore()

  const [url, setUrl] = useState(baseUrl)
  const [token, setToken] = useState(secret)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    const cleanUrl = url.trim().replace(/\/+$/, '')
    const cleanToken = token.trim()

    if (cleanToken.length < 8) {
      setErrorMsg(t('connection.invalidSecret'))
      return
    }

    setLoading(true)

    // AbortController so a hung host can't leave the connect button spinning
    // forever. 10s matches the revalidate probe timeout.
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 10_000)

    try {
      // Test connectivity against CoreC / endpoint and /version
      const res = await fetch(`${cleanUrl}/`, {
        headers: { Authorization: `Bearer ${cleanToken}` },
        signal: ctrl.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const info = await res.json()
      // Persist credentials only after the endpoint has validated, so an
      // invalid URL/token never lands in localStorage.
      setConnection(cleanUrl, cleanToken)
      setConnected(true, { name: info.name, version: info.version })
      navigate('/monitor/dashboard')
    } catch (err: any) {
      const msg =
        err?.name === 'AbortError'
          ? t('connection.connectionFailed', { defaultValue: 'Connection timed out' })
          : err.message || t('connection.connectionFailed')
      setErrorMsg(msg)
      setError(msg)
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-background via-muted/20 to-background relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <Card className="w-full max-w-md border-border/80 bg-card/70 backdrop-blur-xl shadow-2xl relative z-10">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto mb-2 shadow-inner glow-primary">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <CardTitle className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            {t('connection.title')}
          </CardTitle>
          <CardDescription className="text-xs">{t('connection.subtitle')}</CardDescription>
        </CardHeader>

        <form onSubmit={handleConnect}>
          <CardContent className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center space-x-1.5">
                <Server className="w-3.5 h-3.5" />
                <span>{t('connection.serverUrl')}</span>
              </label>
              <Input
                type="text"
                placeholder={t('connection.urlPlaceholder', {
                  defaultValue: 'http://127.0.0.1:9090',
                })}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>{t('connection.secretToken')}</span>
              </label>
              <Input
                type="password"
                placeholder="••••••••••••"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">{t('connection.secretHint')}</p>
            </div>
          </CardContent>

          <CardFooter className="pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full font-semibold flex items-center justify-center space-x-2 h-10 shadow-lg glow-primary"
            >
              <span>{loading ? t('common.loading') : t('connection.connect')}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
