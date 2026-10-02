import {
  AlertCircle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  Terminal,
  Trash2,
} from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DataTypeString } from '@/lib/constants'
import { DATA_TYPES } from '@/types/config'
import type { DeadLetterEntry, WriteCommand } from '@/types/models'

// ─── WriteForm ───────────────────────────────────────────────

interface WriteFormProps {
  drivers: { name: string; type: string }[]
  driver: string
  setDriver: (v: string) => void
  device: string
  setDevice: (v: string) => void
  tag: string
  setTag: (v: string) => void
  type: DataTypeString
  setType: (v: DataTypeString) => void
  value: string
  setValue: (v: string) => void
  successMsg: string | null
  errorMsg: string | null
  onSubmit: (e: React.FormEvent) => void
  confirmOpen: boolean
}

export const WriteForm: React.FC<WriteFormProps> = ({
  drivers,
  driver,
  setDriver,
  device,
  setDevice,
  tag,
  setTag,
  type,
  setType,
  value,
  setValue,
  successMsg,
  errorMsg,
  onSubmit,
  confirmOpen,
}) => {
  const { t } = useTranslation()

  return (
    <Card className="lg:col-span-2 border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span>{t('write.dispatch')}</span>
        </CardTitle>
        <CardDescription className="text-xs">{t('write.dispatchDesc')}</CardDescription>
      </CardHeader>

      <form onSubmit={onSubmit}>
        <CardContent className="p-4 space-y-4">
          {successMsg && (
            <div className="p-3 rounded-lg bg-status-running/10 border border-status-running/20 text-status-running text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {t('write.targetDriver')} *
              </label>
              <Select value={driver} onValueChange={setDriver}>
                <SelectTrigger>
                  <SelectValue placeholder={t('write.selectDriver')} />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.name} value={d.name}>
                      {d.name} ({d.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {t('write.deviceOptional')}
              </label>
              <Input
                placeholder={t('write.devicePlaceholder')}
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
                placeholder={t('write.tagPlaceholder')}
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
              <Select value={type} onValueChange={(v) => setType(v as DataTypeString)}>
                <SelectTrigger className="font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((dt) => (
                    <SelectItem key={dt} value={dt} className="font-mono">
                      {dt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              {t('write.targetValue')} *
            </label>
            <Input
              placeholder={
                type === 'bool' ? t('write.boolPlaceholder') : t('write.valuePlaceholder')
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              className="h-9 font-mono text-xs"
            />
          </div>

          <div className="p-3 rounded-lg bg-status-warning/10 border border-status-warning/20 text-xs text-status-warning">
            {t('write.confirmWarning')}
          </div>
        </CardContent>

        <CardFooter className="p-4 pt-0">
          <Button
            type="submit"
            disabled={confirmOpen}
            className="w-full sm:w-auto h-9 font-semibold flex items-center space-x-2 glow-primary"
          >
            <span>{t('write.submit')}</span>
            <Send className="w-3.5 h-3.5" />
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

// ─── DeadLetterTable ────────────────────────────────────────

interface DeadLetterTableProps {
  visibleDeadLetters: DeadLetterEntry[]
  loadingDlq: boolean
  errorDlq: boolean
  fetchingDlq: boolean
  dlqError: unknown
  dlqClearedMsg: string | null
  replayError: string | null
  onRefresh: () => void
  onClearAll: () => void
  onReplay: (cmd: WriteCommand) => void
  isWritePending: boolean
}

export const DeadLetterTable: React.FC<DeadLetterTableProps> = ({
  visibleDeadLetters,
  loadingDlq,
  errorDlq,
  fetchingDlq,
  dlqError,
  dlqClearedMsg,
  replayError,
  onRefresh,
  onClearAll,
  onReplay,
  isWritePending,
}) => {
  const { t } = useTranslation()

  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-status-error">
            <AlertOctagon className="w-4 h-4" />
            <span>{t('write.deadLetterTitle')}</span>
          </CardTitle>
          <CardDescription className="text-xs">{t('write.deadLetterDesc')}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            disabled={visibleDeadLetters.length === 0 || fetchingDlq}
            className="h-8 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            <span>{t('write.clearAll')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={fetchingDlq}
            className="h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${fetchingDlq ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh')}</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0">
        {dlqClearedMsg && (
          <div className="mb-3 p-3 rounded-lg bg-status-running/10 border border-status-running/20 text-status-running text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{dlqClearedMsg}</span>
          </div>
        )}
        {replayError && (
          <div className="mb-3 p-3 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{t('write.replayFailed', { error: replayError })}</span>
          </div>
        )}

        {loadingDlq ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : errorDlq ? (
          <div className="space-y-3 py-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-status-error" />
            <div className="text-sm font-semibold">{t('common.error')}</div>
            {dlqError instanceof Error && dlqError.message && (
              <div className="mx-auto max-w-md break-all font-mono text-xs text-status-error/80">
                {dlqError.message}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={fetchingDlq}
              className="h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${fetchingDlq ? 'animate-spin' : ''}`} />
              {t('common.retry')}
            </Button>
          </div>
        ) : visibleDeadLetters.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center space-y-1">
            <CheckCircle2 className="w-6 h-6 text-status-running mb-1" />
            <span>{t('write.noDeadLetters')}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleDeadLetters.map((dl) => (
              <div
                key={`${dl.command.driver}-${dl.command.tag}-${dl.failed_at}-${dl.attempts}`}
                className="p-3 rounded-lg border border-status-error/20 bg-status-error/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 font-mono">
                  <div className="text-status-error font-semibold">
                    [{dl.command.driver}] {t('common.tag')}: {dl.command.tag} ={' '}
                    {String(dl.command.value)} ({dl.command.type})
                  </div>
                  <div className="text-xs text-muted-foreground">{dl.error}</div>
                  <div className="text-xs text-muted-foreground flex items-center space-x-2">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(dl.failed_at).toLocaleString()}</span>
                    <span>•</span>
                    <span>{t('write.attemptsExhausted', { count: dl.attempts })}</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReplay(dl.command)}
                  disabled={isWritePending}
                  className="shrink-0 text-xs border-status-error/30 text-status-error hover:bg-status-error/10"
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
  )
}
