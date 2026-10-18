import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, PlugZap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { testInstanceConnection } from '@/features/home/useHomepageProbe'
import { DEFAULT_COREC_URL } from '@/lib/constants'
import { PROBE_ERROR_I18N_KEYS, type ProbeErrorKind } from '@/stores/instanceStore'
import type { CoreCInstance } from '@/types/models'

const instanceSchema = (t: (k: string) => string) =>
  z.object({
    name: z.string().min(1, t('instances.nameRequired')),
    baseUrl: z
      .string()
      .min(1, t('instances.urlRequired'))
      .regex(/^https?:\/\//, t('instances.urlInvalid')),
    secret: z.string().min(8, t('instances.secretMin')),
    useProxy: z.enum(['auto', 'proxy', 'direct']),
    color: z.string().optional(),
    notes: z.string().optional(),
    tags: z.string().optional(),
  })

type InstanceFormData = z.infer<ReturnType<typeof instanceSchema>>

export interface InstanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing instance for edit mode, undefined for create. */
  instance?: CoreCInstance
  onSubmit: (data: {
    name: string
    baseUrl: string
    secret: string
    useProxy?: 'auto' | 'proxy' | 'direct'
    color?: string
    notes?: string
    tags?: string[]
  }) => void
}

// D-22: color names render as aria-label/title, so they must resolve
// through i18n — hardcoded 'Blue'/'Green' read English in a zh UI.
const INSTANCE_COLORS = [
  { value: '', labelKey: 'instances.colorDefault' },
  { value: '#3b82f6', labelKey: 'instances.colorBlue' },
  { value: '#10b981', labelKey: 'instances.colorGreen' },
  { value: '#f59e0b', labelKey: 'instances.colorAmber' },
  { value: '#ef4444', labelKey: 'instances.colorRed' },
  { value: '#8b5cf6', labelKey: 'instances.colorPurple' },
  { value: '#ec4899', labelKey: 'instances.colorPink' },
]

export const InstanceDialog: React.FC<InstanceDialogProps> = ({
  open,
  onOpenChange,
  instance,
  onSubmit,
}) => {
  const { t } = useTranslation()
  const isEdit = !!instance
  const [showSecret, setShowSecret] = useState(false)

  // Memoize the resolver so it's only recreated when the translation function
  // changes (i.e., on language switch), not on every render. This ensures
  // validation error messages update on language switch (FF-1) and avoids
  // unnecessary allocations.
  const resolver = useMemo(() => zodResolver(instanceSchema(t)), [t])

  const form = useForm<InstanceFormData>({
    resolver,
    defaultValues: {
      name: '',
      baseUrl: DEFAULT_COREC_URL,
      secret: '',
      useProxy: 'auto',
      color: '',
      notes: '',
      tags: '',
    },
  })

  // D-13: verdict of the one-shot "test connection" probe. Never blocks the
  // save — it is a preview of what the homepage card will show.
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'testing' | 'ok' | 'fail'
    version?: string
    kind?: ProbeErrorKind
  }>({ status: 'idle' })

  useEffect(() => {
    if (open) {
      form.reset({
        name: instance?.name ?? '',
        baseUrl: instance?.baseUrl ?? DEFAULT_COREC_URL,
        secret: instance?.secret ?? '',
        useProxy: instance?.useProxy ?? 'auto',
        color: instance?.color ?? '',
        notes: instance?.notes ?? '',
        tags: instance?.tags?.join(', ') ?? '',
      })
      // Each open is a fresh session — a previous test verdict is stale.
      setTestResult({ status: 'idle' })
    }
  }, [open, instance, form])

  // A verdict only stays valid while the values it tested are unchanged —
  // editing the address, key or mode invalidates it instead of letting a
  // green "Connected" lie next to freshly edited fields.
  useEffect(() => {
    const sub = form.watch((_values, { name }) => {
      if (name === 'baseUrl' || name === 'secret' || name === 'useProxy') {
        setTestResult({ status: 'idle' })
      }
    })
    return () => sub.unsubscribe()
  }, [form])

  const handleTestConnection = async () => {
    const { baseUrl, secret, useProxy } = form.getValues()
    setTestResult({ status: 'testing' })
    const result = await testInstanceConnection({ baseUrl, secret, useProxy })
    setTestResult(
      result.ok
        ? { status: 'ok', version: result.info?.version ?? '?' }
        : { status: 'fail', kind: result.kind },
    )
  }

  const handleSubmit = (data: InstanceFormData) => {
    onSubmit({
      name: data.name.trim(),
      baseUrl: data.baseUrl.trim().replace(/\/+$/, ''),
      secret: data.secret.trim(),
      useProxy: data.useProxy,
      color: data.color || undefined,
      notes: data.notes || undefined,
      tags: data.tags
        ? data.tags
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('instances.editTitle') : t('instances.addTitle')}</DialogTitle>
          <DialogDescription>{t('instances.addDesc')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('instances.name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('instances.namePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="baseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('instances.serverUrl')}</FormLabel>
                  <FormControl>
                    <Input placeholder="http://127.0.0.1:9090" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="secret"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('instances.secretToken')}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showSecret ? 'text' : 'password'}
                        placeholder="********"
                        className="pr-10"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={showSecret ? t('common.hide') : t('common.show')}
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormControl>
                  {/* A-02: where the key comes from — the #1 cold-start blocker. */}
                  <FormDescription>{t('instances.secretHint')}</FormDescription>
                  {/* A-10: honest disclosure that the key lands in localStorage
                      in plain text — the operator deserves to know before
                      saving a production key on a shared machine. */}
                  <FormDescription>{t('instances.secretStorageNote')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="useProxy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('instances.proxyMode')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="auto">{t('instances.proxyModeAuto')}</SelectItem>
                      <SelectItem value="proxy">{t('instances.proxyModeProxy')}</SelectItem>
                      <SelectItem value="direct">{t('instances.proxyModeDirect')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* A-05: the three modes were bare labels before — the hint
                      explains what each one does and when to pick it. */}
                  <FormDescription>{t('instances.proxyModeHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('instances.color')}</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      {INSTANCE_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => field.onChange(c.value)}
                          aria-pressed={field.value === c.value}
                          aria-label={t(c.labelKey)}
                          className={`w-8 h-8 rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                            field.value === c.value
                              ? 'border-foreground scale-110'
                              : 'border-transparent hover:scale-105'
                          }`}
                          style={{
                            backgroundColor: c.value || 'var(--muted)',
                          }}
                          title={t(c.labelKey)}
                        />
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('instances.tags')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('instances.tagsPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('instances.notes')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('instances.notesPlaceholder')}
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* D-13: one-shot test verdict — visible right above the actions
                so the operator can fix the fields and re-test before saving. */}
            {testResult.status === 'testing' && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('instances.testRunning')}
              </p>
            )}
            {testResult.status === 'ok' && (
              <p className="text-sm text-status-running" role="status">
                {t('instances.testSuccess', { version: testResult.version })}
              </p>
            )}
            {testResult.status === 'fail' && testResult.kind && (
              <p className="text-sm text-status-error" role="alert">
                {t(PROBE_ERROR_I18N_KEYS[testResult.kind])}
              </p>
            )}

            <DialogFooter>
              {/* D-13: verify address + key BEFORE saving; runs the same
                  authenticated probe as the homepage card, so a bad key
                  reports the exact 401 copy the card would show. */}
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleTestConnection()}
                disabled={testResult.status === 'testing'}
              >
                <PlugZap className="w-3.5 h-3.5 mr-1.5" />
                {t('instances.testConnection')}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit">{isEdit ? t('common.save') : t('instances.add')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
