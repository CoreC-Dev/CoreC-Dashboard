import { create } from 'zustand'

export type ThemeMode = 'system' | 'dark' | 'light'

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

function applyThemeToDOM(resolved: 'dark' | 'light') {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

const savedTheme =
  (typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) as ThemeMode) : null) ||
  'system'

const initialResolved = savedTheme === 'system' ? getSystemTheme() : savedTheme
applyThemeToDOM(initialResolved)

export const useThemeStore = create<ThemeState>((set, get) => {
  // Listen for system changes
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().theme === 'system') {
        const sys = getSystemTheme()
        applyThemeToDOM(sys)
        set({ resolvedTheme: sys })
      }
    })
  }

  return {
    theme: savedTheme,
    resolvedTheme: initialResolved,
    setTheme: (theme: ThemeMode) => {
      const resolved = theme === 'system' ? getSystemTheme() : theme
      localStorage.setItem(STORAGE_KEY, theme)
      applyThemeToDOM(resolved)
      set({ theme, resolvedTheme: resolved })
    },
  }
})
