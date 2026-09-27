import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import zhCN from './zh-CN.json'

const STORAGE_KEY = 'corec_locale'
const savedLocale =
  (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || 'zh-CN'

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

export const setLocale = (lng: string) => {
  localStorage.setItem(STORAGE_KEY, lng)
  i18n.changeLanguage(lng)
}

export default i18n
