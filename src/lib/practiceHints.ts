import { lessonsFor } from '@/data/lessons'
import { isAlternateLayoutStroke } from '@/lib/keyboardLayout'
import type { AppState, Layout } from '@/types'

export function hintDelay(layout: Layout, progress: AppState['lessonProgress']): number {
  const completed = lessonsFor(layout).map((lesson) => progress[lesson.id]).filter((lesson) => lesson?.completed)
  if (completed.length < 3) return 0
  const highAccuracy = completed.filter((lesson) => lesson.bestAccuracy >= 97).length
  return completed.length >= 6 && highAccuracy >= 4 ? 1800 : 900
}

export type KeyboardIssue = 'layout' | 'caps-lock' | null

export interface InputDiagnosis {
  layoutStreak: number
  lastLayoutAt: number
  issue: KeyboardIssue
}

export const initialDiagnosis: InputDiagnosis = { layoutStreak: 0, lastLayoutAt: 0, issue: null }

export function diagnoseStroke(
  previous: InputDiagnosis,
  input: { layout: Layout; expected: string; code: string; key: string; capsLock: boolean; at: number },
): InputDiagnosis {
  const { layout, expected, code, key, capsLock, at } = input
  if (isAlternateLayoutStroke(layout, expected, code, key)) {
    const layoutStreak = at - previous.lastLayoutAt <= 1600 ? previous.layoutStreak + 1 : 1
    return { layoutStreak, lastLayoutAt: at, issue: layoutStreak >= 2 ? 'layout' : null }
  }
  const lower = expected.toLowerCase()
  const caseable = lower !== expected.toUpperCase()
  const wrongCase = key !== expected && key.toLowerCase() === lower
  if (capsLock && caseable && (wrongCase || (key === 'CapsLock' && expected === lower))) {
    return { ...initialDiagnosis, issue: 'caps-lock' }
  }
  if (key.length === 1 || key === 'CapsLock' || key === 'Backspace') return initialDiagnosis
  return previous
}
