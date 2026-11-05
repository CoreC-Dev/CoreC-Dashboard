/**
 * features/assistant/AssistantPanel.tsx - the chat surface.
 *
 * Mounted by AppShell, i.e. only inside a /corec/:id/* scope where的宣传 an
 * active connection exists (apiRequest reads it). Placing it on the bare
 * homepage would render a box whose every tool call throws
 * "No active CoreC instance" -- see ADR-015.
 *
 * Presentation only: the turn loop, the step budget and the write
 * confirmation live in useAssistant/runtime, so this file cannot widen what
 * the assistant is allowed to do.
 */
import { Bot, Loader2, Send, Square, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { PendingConfirm } from '@/features/assistant/useAssistant'
import { useAssistant } from '@/features/assistant/useAssistant'
import { useAssistantSettings } from '@/stores/assistantStore'

/** Confirmation card for one pending write-class tool call. */
const ConfirmCard: React.FC<{
  pending: PendingConfirm | null
  answerConfirm: (ok: boolean) => void
}> = ({ pending, answerConfirm }) => {
  const { t } = useTranslation()
  if (!pending) return null
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 space-y-2">
      <p className="text-xs font-medium">
        {t('assistant.confirm.title', { tool: pending.toolName })}
      </p>
      <p className="text-xs text-muted-foreground">{pending.description}</p>
      <pre className="text-[11px] font-mono overflow-x-auto rounded-lg bg-card px-2 py-1">
        {JSON.stringify(pending.args, null, 2)}
      </pre>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => answerConfirm(true)}>
          {t('assistant.confirm.approve')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => answerConfirm(false)}>
          {t('assistant.confirm.decline')}
        </Button>
      </div>
    </div>
  )
}

export const AssistantPanel: React.FC = () => {
  const { t } = useTranslation()
  const { provider, allowWrite } = useAssistantSettings()
  const { entries, draft, streaming, error, pending, send, stop, reset, answerConfirm } =
    useAssistant(provider, allowWrite)
  const [text, setText] = useState('')

  if (!provider) {
    return <p className="text-sm text-muted-foreground px-4 py-8">{t('assistant.noProvider')}</p>
  }

  const submit = () => {
    if (!text.trim() || streaming) return
    void send(text)
    setText('')
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4" />
          <span className="font-semibold text-sm">{t('assistant.title')}</span>
        </div>
        <span className="text-xs text-muted-foreground font-mono">{provider.model}</span>
      </header>

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 py-3 space-y-3">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('assistant.intro')}</p>
          )}
          {entries.map((entry, idx) => (
            <div key={idx} className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {entry.role === 'user' ? t('assistant.you') : t('assistant.model')}
              </p>
              <p className="text-sm whitespace-pre-wrap">{entry.text}</p>
              {entry.tools?.map((tool, j) => (
                <div
                  key={`${idx}-${j}`}
                  className="rounded-lg border border-border bg-muted/30 px-2 py-1 text-[11px] font-mono"
                >
                  <span className="font-semibold">{tool.name}</span>
                  {tool.failed ? (
                    <span className="ml-2 text-destructive">{tool.summary}</span>
                  ) : (
                    <span className="ml-2 text-muted-foreground">{tool.summary}</span>
                  )}
                </div>
              ))}
              {entry.truncated && (
                <p className="text-xs text-muted-foreground">{t('assistant.truncated')}</p>
              )}
            </div>
          ))}
          {streaming && draft && (
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('assistant.model')}
              </p>
              <p className="text-sm whitespace-pre-wrap">{draft}</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {error && (
        <p className="mx-4 mb-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <ConfirmCard pending={pending} answerConfirm={answerConfirm} />

      <footer className="border-t border-border p-3 flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          disabled={streaming || Boolean(pending)}
          placeholder={t('assistant.placeholder')}
          aria-label={t('assistant.placeholder')}
        />
        {streaming ? (
          <Button variant="outline" size="icon" onClick={stop} aria-label={t('assistant.stop')}>
            <Square className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={submit}
            disabled={!text.trim()}
            aria-label={t('assistant.send')}
          >
            <Send className="w-4 h-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            reset()
            setText('')
          }}
          aria-label={t('assistant.clear')}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </footer>

      {streaming && (
        <p className="px-4 pb-2 text-[11px] text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('assistant.thinking')}
        </p>
      )}
    </div>
  )
}
