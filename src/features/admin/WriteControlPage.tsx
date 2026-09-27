import {
  AlertCircle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  RefreshCw,
  RotateCcw,
  Send,
  Terminal,
} from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeadLetters, useDrivers, useWriteTag } from '@/api/hooks'
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

const DATA_TYPES = [
  'bool',
  'int16',
  'int32',
  'int64',
  'uint16',
  'uint32',
  'uint64',
  'float32',
  'float64',
  'string',
]

export const WriteControlPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: driversData } = useDrivers()
  const {
    data: deadLettersData,
    refetch: refetchDeadLetters,
    isFetching: fetchingDlq,
  } = useDeadLetters()
  const writeMutation = useWriteTag()

  const [driver, setDriver] = useState('')
  const [device, setDevice] = useState('')
  const [tag, setTag] = useState('')
  const [type, setType] = useState('float32')
  const [value, setValue] = useState('')
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const drivers = driversData?.drivers || []
  const deadLetters = deadLettersData?.failed_writes || []

  const handleWriteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMsg(null)
    setErrorMsg(null)

    if (!driver || !tag) {
      setErrorMsg('Please select a driver and specify a tag name')
      return
    }

    let parsedVal: any = value
    if (type === 'bool') {
      parsedVal = value.toLowerCase() === 'true' || value === '1'
    } else if (type.startsWith('int') || type.startsWith('uint') || type.startsWith('float')) {
      parsedVal = Number(value)
    }

    try {
      await writeMutation.mutateAsync({
        driver,
        device: device || undefined,
        tag,
        type: type as any,
        value: parsedVal,
      })
      setSuccessMsg(`Command successfully written to [${driver}] ${tag} = ${value}`)
      setValue('')
    } catch (err: any) {
      setErrorMsg(err.message || 'Write command failed')
    }
  }

  const handleReplay = async (cmd: any) => {
    try {
      await writeMutation.mutateAsync(cmd)
      refetchDeadLetters()
    } catch (err: any) {
      alert(`Replay failed: ${err.message}`)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t('write.title')}</h1>
        <p className="text-xs text-muted-foreground">
          Direct PLC coil/register control through Command Manager concurrency pool with deadlock
          protection
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Command Form */}
        <Card className="lg:col-span-2 border-border/80 bg-card/60">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-primary" />
              <span>Dispatch Write Command</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Direct Southbound control command through CoreC API
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleWriteSubmit}>
            <CardContent className="p-4 space-y-4">
              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {t('write.targetDriver')} *
                  </label>
                  <select
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    required
                    className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select target driver...</option>
                    {drivers.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name} ({d.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Device Identifier (Optional)
                  </label>
                  <Input
                    placeholder="e.g. meter-01"
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {t('write.tagName')} *
                  </label>
                  <Input
                    placeholder="e.g. temperature_setpoint or 40001"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    required
                    className="h-9 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {t('write.dataType')} *
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  >
                    {DATA_TYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {t('write.targetValue')} *
                </label>
                <Input
                  placeholder={type === 'bool' ? 'true / false' : 'Numeric or string value'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                  className="h-9 font-mono text-xs"
                />
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-500">
                {t('write.confirmWarning')}
              </div>
            </CardContent>

            <CardFooter className="p-4 pt-0">
              <Button
                type="submit"
                disabled={writeMutation.isPending}
                className="w-full sm:w-auto h-9 font-semibold flex items-center space-x-2 glow-primary"
              >
                <span>{writeMutation.isPending ? t('common.loading') : t('write.submit')}</span>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Right: Info Card */}
        <Card className="border-border/80 bg-card/60">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-semibold">Concurrency & Retries</CardTitle>
            <CardDescription className="text-xs">CoreC Control Plane Safety Specs</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3 text-xs text-muted-foreground">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2">
              <div className="font-semibold text-foreground">Command Concurrency</div>
              <p>
                Controlled via internal counting semaphore (default 16 concurrency), preventing slow
                or disconnected PLCs from exhausting core goroutines.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2">
              <div className="font-semibold text-foreground">Write-Retry-Count</div>
              <p>
                Failed writes automatically retry up to 3 times before failing closed into Dead
                Letter Queue for operator review.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dead Letter Queue Section */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-rose-400">
              <AlertOctagon className="w-4 h-4" />
              <span>{t('write.deadLetterTitle')}</span>
            </CardTitle>
            <CardDescription className="text-xs">{t('write.deadLetterDesc')}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchDeadLetters()}
            disabled={fetchingDlq}
            className="h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${fetchingDlq ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh')}</span>
          </Button>
        </CardHeader>

        <CardContent className="p-4 pt-0">
          {deadLetters.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center space-y-1">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mb-1" />
              <span>{t('write.noDeadLetters')}</span>
            </div>
          ) : (
            <div className="space-y-2">
              {deadLetters.map((dl, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 font-mono">
                    <div className="text-rose-400 font-semibold">
                      [{dl.command.driver}] tag: {dl.command.tag} = {String(dl.command.value)} (
                      {dl.command.type})
                    </div>
                    <div className="text-[11px] text-muted-foreground">{dl.error}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center space-x-2">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(dl.failed_at).toLocaleString()}</span>
                      <span>•</span>
                      <span>{dl.attempts} attempts exhausted</span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReplay(dl.command)}
                    disabled={writeMutation.isPending}
                    className="shrink-0 text-xs border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    <span>{t('write.retry')}</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
