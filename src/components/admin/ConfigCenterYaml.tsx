/**
 * YAML-mode sub-components for the Config Center page.
 *
 * Extracted from ConfigCenterPage.tsx (TD-CPLX-001). Pure/presentational —
 * props in, no business state. No behavior changes: identical CSS classes,
 * i18n keys, and structure. Companion to ConfigCenterParts.tsx (toolbar) and
 * ConfigCenterForm.tsx (form-mode cards).
 */
import Editor from '@monaco-editor/react'
import { ChevronDown, ChevronRight, FileText, GitCompare, History, RotateCcw } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ConfigSnapshot } from '@/hooks/useConfigHistory'
import type { DiffLine } from '@/lib/yamlDiff'
import { useThemeStore } from '@/stores/themeStore'

/** Changes preview — line-by-line diff against the last submitted YAML.
 *  Skipped (renders nothing) until the first submission exists. */
export const DiffPreview: React.FC<{
  lastSubmittedYaml: string | null
  diffOpen: boolean
  onToggleDiff: () => void
  diffLines: DiffLine[]
  hasDiffChanges: boolean
}> = ({ lastSubmittedYaml, diffOpen, onToggleDiff, diffLines, hasDiffChanges }) => {
  const { t } = useTranslation()
  if (lastSubmittedYaml === null) return null
  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center space-x-2">
          <GitCompare className="w-4 h-4 text-primary" />
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-semibold">{t('config.diff')}</CardTitle>
            <CardDescription className="text-xs">{t('config.diffDesc')}</CardDescription>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleDiff}
          aria-expanded={diffOpen}
          aria-label={t('config.diffToggle')}
          className="h-9 w-9"
        >
          {diffOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>
      </CardHeader>
      {diffOpen && (
        <CardContent className="p-4 pt-0">
          {hasDiffChanges ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center space-x-4 px-3 py-1.5 bg-muted/40 border-b border-border text-xs">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-status-running/40" />
                  <span className="text-muted-foreground">{t('config.diffAdded')}</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-status-error/40" />
                  <span className="text-muted-foreground">{t('config.diffRemoved')}</span>
                </span>
              </div>
              <ScrollArea className="h-72">
                <div className="font-mono text-xs">
                  {diffLines.map((line, idx) => (
                    <div
                      key={`diff-${idx}`}
                      className={`px-3 py-0.5 whitespace-pre-wrap break-all ${
                        line.type === 'added'
                          ? 'bg-status-running/10 text-status-running diff-line-add'
                          : line.type === 'removed'
                            ? 'bg-status-error/10 text-status-error diff-line-remove'
                            : 'text-muted-foreground'
                      }`}
                    >
                      <span className="inline-block w-4 select-none">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </span>
                      {line.text === '' ? '\u00A0' : line.text}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-4 text-center">
              {t('config.diffNoChanges')}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

/** Monaco YAML editor card. Reads the theme from the theme store directly. */
export const YamlEditorCard: React.FC<{
  yamlContent: string
  onYamlChange: (value: string) => void
}> = ({ yamlContent, onYamlChange }) => {
  const { t } = useTranslation()
  const { resolvedTheme } = useThemeStore()
  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardHeader className="p-3 bg-muted/30 border-b border-border flex flex-row items-center justify-between">
        <div className="flex items-center space-x-2 text-xs font-mono text-muted-foreground">
          <FileText className="w-3.5 h-3.5 text-primary" />
          <span>{t('config.corecYaml')}</span>
        </div>
        <span className="text-xs text-muted-foreground">{t('config.envVarNote')}</span>
      </CardHeader>
      <div className="h-[60vh] min-h-[320px] md:h-[480px]">
        <Editor
          height="100%"
          defaultLanguage="yaml"
          value={yamlContent}
          onChange={(val) => onYamlChange(val || '')}
          theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            fontFamily: "'JetBrains Mono', Consolas, monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            tabSize: 2,
          }}
        />
      </div>
    </Card>
  )
}

/** Change history — persisted snapshots of every PUT /configs submission. */
export const ChangeHistoryCard: React.FC<{
  history: ConfigSnapshot[]
  onRestore: (snapshot: ConfigSnapshot) => void
}> = ({ history, onRestore }) => {
  const { t } = useTranslation()
  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center space-x-2">
          <History className="w-4 h-4 text-primary" />
          <span>{t('config.history')}</span>
        </CardTitle>
        <CardDescription className="text-xs">{t('config.historyDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {history.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {t('config.historyEmpty')}
          </div>
        ) : (
          <ScrollArea className="h-64">
            <div className="space-y-2 pr-3">
              {history.map((snap, idx) => (
                <div
                  key={`snap-${snap.timestamp}-${idx}`}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-foreground">
                      {new Date(snap.timestamp).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{snap.action}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRestore(snap)}
                    className="h-7 text-xs shrink-0"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    {t('config.restore')}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
