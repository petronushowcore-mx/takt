import { lessonsFor } from '@/data/lessons'
import { assessmentWeekKey, CALIBRATED_BENCHMARK_VERSION, getAssessmentText } from '@/data/practiceTexts'
import { isPracticePaceMode } from '@/lib/sessionModes'
import type { AppState, KeyPair, Layout, Lesson, SessionResult } from '@/types'

export { assessmentWeekKey }
export const ASSESSMENT_MS = 45_000
const DAY_MS = 86_400_000

export function isAssessment(mode: SessionResult['mode']): mode is 'diagnostic' | 'benchmark' {
  return mode === 'diagnostic' || mode === 'benchmark'
}

export function practiceOnly(state: AppState): AppState {
  return { ...state, sessions: state.sessions.filter((session) => isPracticePaceMode(session.mode)) }
}

export function acceptsAssessment(session: SessionResult): boolean {
  if (!isAssessment(session.mode) || (session.layout !== 'ru' && session.layout !== 'en') ||
      session.wallMs !== ASSESSMENT_MS || !Number.isInteger(session.correctChars) || session.correctChars < 5) return false
  const started = new Date(session.startedAt)
  if (Date.parse(session.endedAt) - started.getTime() !== ASSESSMENT_MS) return false

  const expected = getAssessmentText(session.layout, session.mode, started)
  if (session.weekKey !== expected.week || session.correctChars > expected.text.length) return false
  if (session.assessmentId === expected.id) return true
  if (session.mode === 'diagnostic') return session.assessmentId === 'diagnostic-' + session.layout + '-v1'
  return [1, 2].some((version) => session.assessmentId === `benchmark-${session.layout}-v${version}-${expected.week}`)
}

export function isAcceptedBenchmark(session: SessionResult): boolean {
  return session.mode === 'benchmark' && acceptsAssessment(session)
}

export function isCalibratedBenchmark(session: SessionResult): boolean {
  return isAcceptedBenchmark(session) &&
    session.assessmentId === 'benchmark-' + session.layout + '-v' + CALIBRATED_BENCHMARK_VERSION + '-' + session.weekKey
}

export function benchmarkForWeek(state: AppState, layout: Layout, week = assessmentWeekKey()) {
  return state.sessions.find((session) => session.layout === layout && session.weekKey === week && isAcceptedBenchmark(session))
}

export function recommendedLevel(session: SessionResult): number {
  if (session.mode !== 'diagnostic' || session.accuracy < 95 || !acceptsAssessment(session)) return 1
  let start = 1
  for (const lesson of lessonsFor(session.layout).slice(0, 6)) {
    const enoughTargetKeys = lesson.keys.split(' ').every((key) => {
      const stat = session.keyStats[key]
      return stat && stat.attempts >= 2 && stat.errors === 0
    })
    if (!enoughTargetKeys || session.wpm < lesson.targetWpm) break
    start = lesson.level + 1
  }
  return start
}

function recordedLessonPass(state: AppState, session: SessionResult, lesson: Lesson): boolean {
  const progress = state.lessonProgress[lesson.id]
  return session.completedText !== false && Boolean(progress?.completed) && session.accuracy >= lesson.minAccuracy &&
    session.wpm >= (session.targetWpm ?? progress?.targetWpm ?? lesson.targetWpm)
}

export function placementLevel(state: AppState, layout: Layout): number {
  const sessions = state.sessions.filter((session) => session.layout === layout)
  const course = lessonsFor(layout)
  const firstPass = sessions.find((session) => {
    if (session.mode !== 'lesson') return false
    const lesson = course.find((item) => item.id === session.lessonId)
    return lesson && recordedLessonPass(state, session, lesson)
  })
  if (!firstPass && course.some((lesson) => state.lessonProgress[lesson.id]?.completed)) return 1
  const diagnostic = sessions.reverse().find((session) =>
    session.mode === 'diagnostic' && acceptsAssessment(session) && (!firstPass || session.endedAt <= firstPass.startedAt),
  )
  return diagnostic ? recommendedLevel(diagnostic) : 1
}

export function isCourseLessonAvailable(lesson: Lesson, state: AppState): boolean {
  const previous = lessonsFor(lesson.layout)[lesson.level - 2]
  return lesson.level <= placementLevel(state, lesson.layout) ||
    Boolean(state.lessonProgress[lesson.id]?.completed || (previous && state.lessonProgress[previous.id]?.completed))
}

export function nextCourseLesson(state: AppState, layout: Layout): Lesson {
  const start = placementLevel(state, layout)
  const available = lessonsFor(layout).filter((lesson) => lesson.level >= start && isCourseLessonAvailable(lesson, state))
  return available.find((lesson) => !state.lessonProgress[lesson.id]?.completed) ?? available.at(-1)!
}

export function knownKeys(state: AppState, layout: Layout, currentLevel = nextCourseLesson(state, layout).level): Set<string> {
  return new Set(lessonsFor(layout).slice(0, currentLevel).flatMap((lesson) => lesson.keys.split(' ')))
}

export function reviewKeysForResult(state: AppState, session: SessionResult): Set<string> {
  const lesson = session.mode === 'lesson'
    ? lessonsFor(session.layout).find(({ id }) => id === session.lessonId)
    : undefined
  return knownKeys(state, session.layout, lesson?.level)
}

function pairId(pair: KeyPair): string {
  return `${pair.expected}->${pair.actual}`
}

export function rankedPairs(session: SessionResult, known: ReadonlySet<string>): Array<KeyPair & { count: number }> {
  return Object.entries(session.confusions ?? {}).flatMap(([key, count]) => {
    const [expected, actual] = key.split('->')
    return count > 0 && expected !== actual && known.has(expected) && known.has(actual) &&
      expected.length === 1 && actual.length === 1 ? [{ expected, actual, count }] : []
  }).sort((left, right) => right.count - left.count || pairId(left).localeCompare(pairId(right)))
}

export interface ReviewItem extends KeyPair {
  dueAt: number
  intervalMs: number
  status: 'new' | 'building' | 'stable' | 'forgotten' | 'insufficient'
}

interface ScheduledReview extends ReviewItem {
  successes: number
  lapses: number
}

interface ReviewEvidence {
  session: SessionResult
  lesson?: Lesson
  startedAt: number
  at: number
}

function introductionDates(state: AppState, layout: Layout, evidence: readonly ReviewEvidence[]): Map<string, number> {
  const course = lessonsFor(layout)
  const dates = new Map<string, number>()
  const introduce = (level: number, at: number) => {
    for (const key of knownKeys(state, layout, level)) {
      dates.set(key, Math.min(dates.get(key) ?? Infinity, at))
    }
  }
  introduce(1, -Infinity)
  const firstPass = evidence.find(({ session, lesson }) => lesson && recordedLessonPass(state, session, lesson))
  for (const { session, lesson, startedAt, at } of evidence) {
    if (session.mode === 'diagnostic' && (!firstPass || at <= firstPass.startedAt)) introduce(recommendedLevel(session), at)
    if (lesson) {
      introduce(lesson.level, startedAt)
      if (recordedLessonPass(state, session, lesson)) introduce(lesson.level + 1, at)
    }
  }
  for (const lesson of course) {
    const progress = state.lessonProgress[lesson.id]
    const lastAt = Date.parse(progress?.lastAt ?? '')
    if (progress?.completed && Number.isFinite(lastAt)) introduce(lesson.level + 1, lastAt)
  }
  return dates
}

function initialReview(pair: KeyPair, dueAt: number): ScheduledReview {
  return { expected: pair.expected, actual: pair.actual, dueAt, intervalMs: DAY_MS, status: 'new', successes: 0, lapses: 0 }
}

function forgottenReview(item: ScheduledReview, at: number): ScheduledReview {
  const intervalMs = item.lapses > 0 ? DAY_MS / 2 : DAY_MS
  return { ...item, intervalMs, dueAt: at + intervalMs, status: 'forgotten', successes: 0, lapses: item.lapses + 1 }
}

function updateReview(item: ScheduledReview, session: SessionResult, at: number): ScheduledReview {
  if (session.confusions?.[pairId(item)] > 0) return forgottenReview(item, at)
  const stats = [session.keyStats[item.expected], session.keyStats[item.actual]]
  if (stats.some((stat) => !stat || stat.attempts < 3 || stat.errors * 10 > stat.attempts)) {
    return { ...item, dueAt: at + DAY_MS, status: 'insufficient' }
  }

  const strong = stats.every((stat) => stat.attempts >= 5 && stat.errors === 0)
  const intervalDays = Math.min(30, Math.max(2, Math.ceil(item.intervalMs / DAY_MS * (strong ? 2.2 : 1.5))))
  const intervalMs = intervalDays * DAY_MS
  const successes = item.successes + 1
  return {
    ...item,
    intervalMs,
    dueAt: at + intervalMs,
    status: successes >= 3 && intervalDays >= 7 ? 'stable' : 'building',
    successes,
    lapses: 0,
  }
}

export function dueReviewItems(state: AppState, layout: Layout, now = Date.now()): ReviewItem[] {
  const known = knownKeys(state, layout)
  const queue = new Map<string, ScheduledReview>()
  const course = lessonsFor(layout)
  const evidence: ReviewEvidence[] = state.sessions.filter((session) => session.layout === layout &&
    (session.mode === 'lesson' || session.mode === 'adaptive' || session.mode === 'review' ||
      session.mode === 'precision' || session.mode === 'diagnostic'))
    .map((session) => {
      const at = Date.parse(session.endedAt)
      const started = Date.parse(session.startedAt)
      const startedAt = Number.isFinite(started) && started <= at ? started : at
      const lesson = session.mode === 'lesson' ? course.find(({ id }) => id === session.lessonId) : undefined
      return { session, lesson, at, startedAt }
    })
    .filter(({ at }) => Number.isFinite(at) && at <= now)
    .sort((left, right) => left.at - right.at)
  const introduced = introductionDates(state, layout, evidence)
  for (const { session, at, startedAt } of evidence) {
    if (session.mode === 'diagnostic') continue
    const knownThen = new Set([...known].filter((key) => (introduced.get(key) ?? Infinity) <= startedAt))
    const reviewed = new Set<string>()
    if (session.mode === 'review' && session.completedText) {
      for (const pair of session.reviewPairs ?? []) {
        if (!knownThen.has(pair.expected) || !knownThen.has(pair.actual) || pair.expected === pair.actual) continue
        const id = pairId(pair)
        const item = queue.get(id) ?? initialReview(pair, at)
        if (at < item.dueAt || reviewed.has(id)) continue
        reviewed.add(id)
        queue.set(id, updateReview(item, session, at))
      }
    }
    for (const pair of rankedPairs(session, knownThen).slice(0, 3)) {
      const id = pairId(pair)
      if (reviewed.has(id)) continue
      const prior = queue.get(id)
      if (!prior) {
        queue.set(id, initialReview(pair, at + DAY_MS))
      } else if (prior.successes > 0) {
        const forgotten = forgottenReview(prior, at)
        queue.set(id, { ...forgotten, dueAt: Math.min(prior.dueAt, forgotten.dueAt) })
      }
    }
  }
  return [...queue.values()].filter((item) => item.dueAt <= now)
    .sort((left, right) => left.dueAt - right.dueAt || pairId(left).localeCompare(pairId(right))).slice(0, 3)
    .map(({ expected, actual, dueAt, intervalMs, status }) => ({ expected, actual, dueAt, intervalMs, status }))
}

export function dueReviewPairs(state: AppState, layout: Layout, now = Date.now()): KeyPair[] {
  return dueReviewItems(state, layout, now).map(({ expected, actual }) => ({ expected, actual }))
}
