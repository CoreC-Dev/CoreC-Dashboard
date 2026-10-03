import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { DEFAULT_COREC_URL } from '@/lib/constants'
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

const INSTANCE_COLORS = [
  { value: '', label: 'Default' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
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

  const form = useForm<InstanceFormData>({
    resolver: zodResolver(instanceSchema(t)),
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
    }
  }, [open, instance, form])

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
                          aria-label={c.label}
                          className={`w-8 h-8 rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                            field.value === c.value
                              ? 'border-foreground scale-110'
                              : 'border-transparent hover:scale-105'
                          }`}
                          style={{
                            backgroundColor: c.value || 'var(--muted)',
                          }}
                          title={c.label}
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

            <DialogFooter>
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
