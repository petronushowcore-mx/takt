import { useCallback } from 'react'
import { useAppState } from '@/hooks/useAppState'
import { translate, type Translator } from './messages'

export function useI18n() {
  const { state } = useAppState()
  const locale = state.settings.language ?? 'ru'
  const t = useCallback<Translator>((message, values) => translate(locale, message, values), [locale])
  return { locale, t }
}
