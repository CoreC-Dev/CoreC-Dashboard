import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown, Moon, Sun } from 'lucide-react'
import type React from 'react'
import { useRef } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem } from '@/components/ui/select'
import { cn } from '@/lib/cn'
import { THEME_I18N_KEYS, THEME_VARIANTS, useThemeStore } from '@/stores/themeStore'

interface ThemeSelectorProps {
  /** Effective collapsed state (false on mobile — drawer shows full text). */
  eff: boolean
}

/**
 * Theme selector dropdown. Switches theme with a circular-reveal animation
 * that expands from the trigger button position to cover the full screen.
 * Uses the View Transitions API (Chromium 111+); falls back to an instant
 * switch when the API is unavailable.
 */
export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ eff }) => {
  const { t } = useTranslation()
  const { theme, resolvedTheme, setTheme } = useThemeStore()

  // Theme trigger ref — used to anchor the circular-reveal view transition.
  const themeTriggerRef = useRef<HTMLButtonElement>(null)

  const handleThemeChange = (newTheme: string) => {
    const btn = themeTriggerRef.current
    if (!btn || !document.startViewTransition) {
      setTheme(newTheme as typeof theme)
      return
    }
    const rect = btn.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )
    document.documentElement.style.setProperty('--theme-x', `${x}px`)
    document.documentElement.style.setProperty('--theme-y', `${y}px`)
    document.documentElement.style.setProperty('--theme-r', `${endRadius}px`)
    document.startViewTransition(() => {
      flushSync(() => setTheme(newTheme as typeof theme))
    })
  }

  return (
    <Select value={theme} onValueChange={handleThemeChange}>
      <SelectPrimitive.Trigger asChild>
        <button
          ref={themeTriggerRef}
          type="button"
          className={cn(
            'grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200',
            eff
              ? 'w-9 h-9 rounded-full'
              : 'w-full h-11 rounded-lg flex items-center px-2.5 gap-2.5',
          )}
          aria-label={t('aria.selectTheme')}
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="w-[18px] h-[18px] shrink-0 icon-morph" />
          ) : (
            <Sun className="w-[18px] h-[18px] shrink-0 icon-morph" />
          )}
          {!eff && (
            <>
              <span className="text-sm font-medium truncate text-left flex-1">
                {t(THEME_I18N_KEYS[theme])}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </SelectPrimitive.Trigger>
      <SelectContent side="right" align="start" className="w-40">
        <SelectItem value="system">{t(THEME_I18N_KEYS.system)}</SelectItem>
        {THEME_VARIANTS.map((variant) => (
          <SelectItem key={variant} value={variant}>
            {t(THEME_I18N_KEYS[variant])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
