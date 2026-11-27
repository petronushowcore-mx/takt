import type { Language } from '@/types'
import { commonMessages } from '@/locales/common'
import { shellMessages, shellRussianMessages } from '@/locales/shell'
import { practiceMessages } from '@/locales/practice'
import { progressMessages } from '@/locales/progress'

type Values = Record<string, string | number>
export type Translator = (message: string, values?: Values) => string

const catalogues: ReadonlyArray<Partial<Record<Language, Record<string, string>>>> = [
  progressMessages, practiceMessages, { ...shellMessages, ru: shellRussianMessages }, commonMessages,
]

function messageFor(locale: Language, key: string) {
  for (const catalogue of catalogues) {
    const entries = catalogue[locale]
    if (entries && Object.hasOwn(entries, key)) return entries[key]
  }
  return undefined
}

export function translate(locale: Language, message: string, values?: Values): string {
  const template = messageFor(locale, message) ?? (locale === 'ru' ? message : messageFor('en', message)) ?? message
  return values ? template.replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : token) : template
}
