import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/i18n/en.json'
import zhCN from '@/i18n/zh-CN.json'

const STORAGE_KEY = 'corec_locale'
const savedLocale =
  (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || 'zh-CN'

/**
 * D-11: keep <html lang> in sync with the active locale so screen readers
 * pick the right voice engine (index.html ships a static zh-CN default and
 * does not follow language switches on its own).
 */
function syncDocumentLang(lng: string): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lng
  }
}

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    en: { translation: en },
  },
  lng: savedLocale,
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false,
  },
})

// Covers both the startup locale and every changeLanguage call.
i18n.on('languageChange', syncDocumentLang)
syncDocumentLang(i18n.language)

export const setLocale = (lng: string) => {
  localStorage.setItem(STORAGE_KEY, lng)
  // Synchronous DOM update — i18next defers its languageChange event to a
  // microtask (after resource loading), and <html lang> should not lag the
  // click that switched the language.
  syncDocumentLang(lng)
  i18n.changeLanguage(lng)
}

export default i18n
