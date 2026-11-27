import { isPaceSample } from '@/lib/analytics'
import type { SessionMode, SessionResult } from '@/types'

export function isPracticePaceMode(mode: SessionMode): boolean {
  return mode !== 'diagnostic' && mode !== 'benchmark' && mode !== 'transition' &&
    mode !== 'transfer-practice' && mode !== 'transfer-control' && mode !== 'layout-switch' && mode !== 'hardcore'
}

export function isPracticeActivityMode(mode: SessionMode): boolean {
  return isPracticePaceMode(mode) || mode === 'transition' || mode === 'transfer-practice' || mode === 'layout-switch' || mode === 'hardcore'
}

export function lessonPaceObservation(session: SessionResult): SessionResult {
  return session.mode === 'lesson' && session.lessonScored ? { ...session, ...session.lessonScored } : session
}

export function isLessonPaceSession(session: SessionResult): boolean {
  // Schema v1 records from before completedText was stored keep their lesson pace.
  return session.mode === 'lesson' && session.completedText !== false && isPaceSample(lessonPaceObservation(session))
}

export function hasTextPace(mode: SessionMode): boolean {
  return mode !== 'layout-switch'
}
