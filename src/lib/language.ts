import type { Language } from '@/types'

export const languages: Record<Language, string> = {
  en: 'English', ru: 'Русский', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português',
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.hasOwn(languages, value)
}

export function preferredLanguage(candidates: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages): Language {
  for (const tag of candidates) {
    const base = tag.split('-')[0].toLowerCase()
    if (isLanguage(base)) return base
  }
  return 'en'
}
