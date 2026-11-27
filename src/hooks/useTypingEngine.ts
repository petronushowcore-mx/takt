import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { KeyPair, Layout, Lesson, LetterTransition, SessionMode, SessionResult, SessionSample } from '@/types'
import { buildSessionResult, calculateActiveMs, charsPerMinute, PAUSE_THRESHOLD_MS, scoreLesson, type KeyEntry } from '@/lib/metrics'
import { createId } from '@/lib/storage'
import { collectTransitions } from '@/lib/transitions'

interface TypingOptions {
  text: string
  mode: SessionMode
  layout: Layout
  lesson?: Lesson
  targetWpm?: number
  scoreFrom?: number
  assessment?: { id: string; durationMs: number; week?: string }
  reviewPairs?: KeyPair[]
  transitionPairs?: LetterTransition[]
  keyboardTarget?: RefObject<HTMLElement | null>
  beforeStart?: (at: number) => boolean
  onComplete?: (result: SessionResult) => void
}

interface Snapshot {
  cursor: number
  correct: number
  errors: number
  backspaces: number
  streak: number
  bestStreak: number
  activeMs: number
  started: boolean
  startedAtMs: number
  lastError: { position: number; actual: string; at: number } | null
  lastPressed: string
  errorPositions: Set<number>
}

function emptySnapshot(): Snapshot {
  return { cursor: 0, correct: 0, errors: 0, backspaces: 0, streak: 0, bestStreak: 0, activeMs: 0, started: false, startedAtMs: 0, lastError: null, lastPressed: '', errorPositions: new Set() }
}

export function useTypingEngine({ text, mode, layout, lesson, targetWpm, scoreFrom, assessment, reviewPairs, transitionPairs, keyboardTarget, beforeStart, onComplete }: TypingOptions) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [result, setResult] = useState<SessionResult | null>(null)
  const [now, setNow] = useState(0)
  const entries = useRef<KeyEntry[]>([])
  const cursor = useRef(0)
  const correct = useRef(0)
  const errors = useRef(0)
  const backspaces = useRef(0)
  const streak = useRef(0)
  const bestStreak = useRef(0)
  const startedAt = useRef<Date | null>(null)
  const samples = useRef<SessionSample[]>([])
  const errorPositions = useRef<Set<number>>(new Set())
  const firstPass = useRef<({ attempted: number; errors: number })>({ attempted: 0, errors: 0 })
  const done = useRef(false)
  const id = useRef(createId())
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  const sync = useCallback(() => {
    setSnapshot({
      cursor: cursor.current,
      correct: correct.current,
      errors: errors.current,
      backspaces: backspaces.current,
      streak: streak.current,
      bestStreak: bestStreak.current,
      activeMs: calculateActiveMs(entries.current.filter((entry) => !entry.backspace)),
      started: Boolean(startedAt.current),
      startedAtMs: startedAt.current?.getTime() ?? 0,
      lastError: null,
      lastPressed: '',
      errorPositions: new Set(errorPositions.current),
    })
  }, [])

  const finalize = useCallback((partial = false) => {
    if (done.current || !startedAt.current) return null
    if (assessment ? partial || Date.now() - startedAt.current.getTime() < assessment.durationMs : cursor.current < (partial ? 5 : text.length)) return null
    done.current = true
    const endedAt = assessment ? new Date(startedAt.current.getTime() + assessment.durationMs) : new Date()
    const activeMs = calculateActiveMs(entries.current.filter((entry) => !entry.backspace))
    samples.current.push({ atMs: endedAt.getTime() - startedAt.current.getTime(), correctChars: cursor.current, errors: errors.current, activeMs })
    const session = buildSessionResult({
      id: id.current,
      startedAt: startedAt.current,
      endedAt,
      entries: entries.current,
      correctChars: cursor.current,
      errors: errors.current,
      backspaces: backspaces.current,
      bestStreak: bestStreak.current,
      mode,
      layout,
      lessonId: lesson?.id,
      lessonTitle: lesson?.title,
      level: lesson?.level ?? 0,
      samples: samples.current,
      paceWindowMs: assessment?.durationMs,
    })
    session.completedText = cursor.current === text.length
    if (lesson) {
      session.targetWpm = targetWpm
      if (scoreFrom !== undefined) {
        const scored = scoreLesson(entries.current, cursor.current, scoreFrom)
        const cpm = charsPerMinute(scored.correctChars, scored.activeMs)
        session.lessonScored = scored
        session.cpm = Math.round(cpm * 10) / 10
        session.wpm = Math.round(cpm * 2) / 10
        session.accuracy = scored.totalKeys ? Math.round((1 - scored.errors / scored.totalKeys) * 1000) / 10 : 100
      }
    }
    if (assessment) {
      session.assessmentId = assessment.id
      session.weekKey = assessment.week
    }
    if (reviewPairs?.length) session.reviewPairs = reviewPairs
    if (transitionPairs?.length) session.transitionPairs = transitionPairs
    if (mode === 'lesson' || mode === 'adaptive' || mode === 'precision' || mode === 'transition') {
      const transitions = collectTransitions(entries.current, layout, PAUSE_THRESHOLD_MS)
      if (Object.keys(transitions).length) session.transitions = transitions
    }
    if (mode === 'transfer-practice' || mode === 'transfer-control') {
      const { attempted, errors } = firstPass.current
      session.firstPassErrors = errors
      session.firstPassAccuracy = attempted ? Math.round(1000 * (attempted - errors) / attempted) / 10 : 0
    }
    setResult(session)
    onCompleteRef.current?.(session)
    return session
  }, [assessment, layout, lesson, mode, reviewPairs, scoreFrom, targetWpm, text.length, transitionPairs])

  useEffect(() => {
    if (result || !text) return
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.repeat || done.current) return
      const target = event.target
      if (keyboardTarget && !(target instanceof Node && keyboardTarget.current?.contains(target))) return
      if (target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]')) return
      if ((event.key === ' ' || event.key === 'Enter') && target instanceof Element && target.closest('button, a, [role="button"]')) return
      const at = Date.now()
      if (assessment && startedAt.current && at - startedAt.current.getTime() >= assessment.durationMs) {
        finalize()
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        if (cursor.current > 0) {
          cursor.current -= 1
          backspaces.current += 1
          streak.current = 0
          entries.current.push({ at, expected: text[cursor.current], actual: 'Backspace', correct: true, backspace: true })
          sync()
        }
        return
      }
      if (event.key.length !== 1) return
      event.preventDefault()
      if (cursor.current >= text.length) return
      if (!startedAt.current) {
        if (beforeStart && !beforeStart(at)) return
        startedAt.current = new Date(at)
      }
      const expected = text[cursor.current]
      const isCorrect = event.key === expected
      if (cursor.current === firstPass.current.attempted) {
        firstPass.current.attempted += 1
        firstPass.current.errors += Number(!isCorrect)
      }
      entries.current.push({ at, expected, actual: event.key, correct: isCorrect, position: cursor.current })
      if (isCorrect) {
        correct.current += 1
        cursor.current += 1
        streak.current += 1
        bestStreak.current = Math.max(bestStreak.current, streak.current)
      } else {
        errors.current += 1
        streak.current = 0
        errorPositions.current.add(cursor.current)
      }
      const lastPrintable = entries.current.filter((entry) => !entry.backspace)
      const last = lastPrintable.at(-1)
      const previous = lastPrintable.at(-2)
      const wallMs = at - (startedAt.current?.getTime() ?? at)
      const lastSampleMs = samples.current.at(-1)?.atMs ?? 0
      if (last && previous && wallMs - lastSampleMs >= 5000) {
        samples.current.push({ atMs: wallMs, correctChars: cursor.current, errors: errors.current, activeMs: calculateActiveMs(lastPrintable) })
      }
      setSnapshot({
        cursor: cursor.current,
        correct: correct.current,
        errors: errors.current,
        backspaces: backspaces.current,
        streak: streak.current,
        bestStreak: bestStreak.current,
        activeMs: calculateActiveMs(lastPrintable),
        started: true,
        startedAtMs: startedAt.current.getTime(),
        lastError: isCorrect ? null : { position: cursor.current, actual: event.key, at },
        lastPressed: event.key,
        errorPositions: new Set(errorPositions.current),
      })
      setNow(at)
      if (cursor.current >= text.length) finalize()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [assessment, beforeStart, finalize, keyboardTarget, result, sync, text])

  useEffect(() => {
    if (!snapshot.started || result) return
    const timer = window.setInterval(() => {
      setNow(Date.now())
      if (assessment) finalize()
    }, 250)
    return () => window.clearInterval(timer)
  }, [assessment, finalize, result, snapshot.started])

  const restart = useCallback(() => {
    entries.current = []
    cursor.current = 0
    correct.current = 0
    errors.current = 0
    backspaces.current = 0
    streak.current = 0
    bestStreak.current = 0
    startedAt.current = null
    samples.current = []
    errorPositions.current = new Set()
    firstPass.current = { attempted: 0, errors: 0 }
    done.current = false
    id.current = createId()
    setResult(null)
    setSnapshot(emptySnapshot())
    setNow(0)
  }, [])

  const scored = scoreFrom === undefined ? undefined : scoreLesson(entries.current, snapshot.cursor, scoreFrom)
  const liveWpm = Math.min(999, Math.round(charsPerMinute(scored?.correctChars ?? snapshot.cursor, scored?.activeMs ?? snapshot.activeMs) / 5))
  const liveAccuracy = scored
    ? scored.totalKeys ? Math.round((1 - scored.errors / scored.totalKeys) * 1000) / 10 : 100
    : snapshot.started ? Math.round((snapshot.correct / Math.max(1, snapshot.correct + snapshot.errors)) * 1000) / 10 : 100
  const elapsedMs = snapshot.started ? Math.max(0, now - snapshot.startedAtMs) : 0

  return { snapshot, result, restart, finish: () => finalize(true), liveWpm, liveAccuracy, elapsedMs, errorPositions: snapshot.errorPositions }
}
