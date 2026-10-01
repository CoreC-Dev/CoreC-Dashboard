import { create } from 'zustand'

export type ThemeMode =
  | 'system'
  | 'light'
  | 'dark'
  | 'light-sepia'
  | 'light-nord'
  | 'dark-midnight'
  | 'dark-forest'

/** All selectable theme variants (excluding "system" which resolves to light/dark). */
export const THEME_VARIANTS: ThemeMode[] = [
  'light',
  'dark',
  'light-sepia',
  'light-nord',
  'dark-midnight',
  'dark-forest',
]

/** Human-readable labels for each variant. */
export const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  'light-sepia': 'Sepia',
  'light-nord': 'Nord',
  'dark-midnight': 'Midnight',
  'dark-forest': 'Forest',
}

/** i18n keys for each theme variant — use t(THEME_I18N_KEYS[mode]) in components. */
export const THEME_I18N_KEYS: Record<ThemeMode, string> = {
  system: 'settings.system',
  light: 'settings.light',
  dark: 'settings.dark',
  'light-sepia': 'settings.themeSepia',
  'light-nord': 'settings.themeNord',
  'dark-midnight': 'settings.themeMidnight',
  'dark-forest': 'settings.themeForest',
}

/** Whether a variant is a dark theme (needs `.dark` class for Tailwind). */
const DARK_VARIANTS: ThemeMode[] = ['dark', 'dark-midnight', 'dark-forest']

interface ThemeState {
  theme: ThemeMode
  resolvedTheme: 'dark' | 'light'
  setTheme: (theme: ThemeMode) => void
}

const STORAGE_KEY = 'corec_theme'

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Determine whether a theme mode is dark. */
function isDarkTheme(theme: ThemeMode): boolean {
  if (theme === 'system') return getSystemTheme() === 'dark'
  return DARK_VARIANTS.includes(theme)
}

/** Apply theme to the DOM: set data-theme attribute and .dark class. */
function applyThemeToDOM(theme: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const dark = isDarkTheme(theme)

  // data-theme attribute selects the CSS variable block.
  // For "system", resolve to light/dark.
  const dataTheme = theme === 'system' ? (dark ? 'dark' : 'light') : theme
  root.setAttribute('data-theme', dataTheme)

  // .dark class for Tailwind dark: utilities
  if (dark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

const savedTheme =
  (typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) as ThemeMode) : null) ||
  'system'

// Validate saved theme — if it's not a known variant, fall back to system.
const validTheme =
  THEME_VARIANTS.includes(savedTheme) || savedTheme === 'system' ? savedTheme : 'system'
applyThemeToDOM(validTheme)

export const useThemeStore = create<ThemeState>((set, get) => {
  // Listen for system changes
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().theme === 'system') {
        applyThemeToDOM('system')
        set({ resolvedTheme: getSystemTheme() })
      }
    })
  }

  return {
    theme: validTheme,
    resolvedTheme: isDarkTheme(validTheme) ? 'dark' : 'light',
    setTheme: (theme: ThemeMode) => {
      localStorage.setItem(STORAGE_KEY, theme)
      applyThemeToDOM(theme)
      set({ theme, resolvedTheme: isDarkTheme(theme) ? 'dark' : 'light' })
    },
  }
})
