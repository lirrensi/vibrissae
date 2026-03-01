import { createI18n } from 'vue-i18n'
import en from './en.json'
import fr from './fr.json'
import es from './es.json'
import pl from './pl.json'
import ru from './ru.json'
import zh from './zh.json'
import ja from './ja.json'
import de from './de.json'

export type SupportedLocale = 'en' | 'fr' | 'es' | 'pl' | 'ru' | 'zh' | 'ja' | 'de'

export const supportedLocales: { code: SupportedLocale; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pl', name: 'Polski' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'de', name: 'Deutsch' },
]

// Get browser language or default to English
function getDefaultLocale(): SupportedLocale {
  const browserLang = navigator.language.split('-')[0]
  const supported = supportedLocales.map(l => l.code)
  return supported.includes(browserLang as SupportedLocale) 
    ? browserLang as SupportedLocale 
    : 'en'
}

// Get stored locale or detect from browser
function getStoredLocale(): SupportedLocale | null {
  const stored = localStorage.getItem('locale')
  if (stored && supportedLocales.some(l => l.code === stored)) {
    return stored as SupportedLocale
  }
  return null
}

export const i18n = createI18n({
  legacy: false,
  locale: getStoredLocale() ?? getDefaultLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    fr,
    es,
    pl,
    ru,
    zh,
    ja,
    de,
  },
})

export function setLocale(locale: SupportedLocale) {
  i18n.global.locale.value = locale
  localStorage.setItem('locale', locale)
  document.documentElement.lang = locale
}

// Initialize document lang attribute
document.documentElement.lang = i18n.global.locale.value