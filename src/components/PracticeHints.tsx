import { useEffect, useRef, useState } from 'react'
import { Keyboard } from 'lucide-react'
import { VirtualKeyboard } from '@/components/VirtualKeyboard'
import { useI18n } from '@/lib/i18n'
import { diagnoseStroke, hintDelay, initialDiagnosis, type KeyboardIssue } from '@/lib/practiceHints'
import type { AppState, Layout } from '@/types'

interface PracticeHintsProps {
  layout: Layout
  expected: string
  position: number
  lessonProgress: AppState['lessonProgress']
  active: boolean
  showKeyboard: boolean
  guided?: boolean
  pressed?: string
}

export function PracticeHints({ layout, expected, position, lessonProgress, active, showKeyboard, guided, pressed = '' }: PracticeHintsProps) {
  const { t } = useI18n()
  const delay = guided ? 0 : hintDelay(layout, lessonProgress)
  const cue = position + ':' + expected
  const [revealedCue, setRevealedCue] = useState<string>()
  const [issue, setIssue] = useState<KeyboardIssue>(null)
  const diagnosis = useRef(initialDiagnosis)

  useEffect(() => {
    if (!active || !showKeyboard || !delay || !expected) return
    const timeout = window.setTimeout(() => setRevealedCue(cue), delay)
    return () => window.clearTimeout(timeout)
  }, [active, showKeyboard, delay, expected, cue])

  useEffect(() => {
    if (!active || !expected) return
    const reset = () => {
      diagnosis.current = initialDiagnosis
      setIssue(null)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return
      diagnosis.current = diagnoseStroke(diagnosis.current, {
        layout,
        expected,
        code: event.code,
        key: event.key,
        capsLock: event.getModifierState('CapsLock'),
        at: event.timeStamp,
      })
      setIssue(diagnosis.current.issue)
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('blur', reset)
    }
  }, [active, expected, layout])

  if (!active || !expected) return null

  const message = issue === 'layout'
    ? t(layout === 'ru' ? 'Переключи раскладку на русскую (RU).' : 'Переключи раскладку на английскую (EN).')
    : issue === 'caps-lock' ? t('Выключи Caps Lock, чтобы набрать нужный регистр.') : null

  return (
    <>
      <div role="status" className={message ? 'error-feedback' : undefined}>
        {message && <><Keyboard aria-hidden="true" size={16} />{message}</>}
      </div>
      {showKeyboard && (delay === 0 || revealedCue === cue || issue !== null)
        && <VirtualKeyboard layout={layout} nextKey={expected} pressedKey={pressed} />}
    </>
  )
}
