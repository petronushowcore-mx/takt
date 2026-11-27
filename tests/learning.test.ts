import { describe, expect, it } from 'vitest'
import { lessonsFor } from '@/data/lessons'
import { getAssessmentText } from '@/data/practiceTexts'
import { acceptsAssessment, ASSESSMENT_MS, benchmarkForWeek, dueReviewItems, dueReviewPairs, isAcceptedBenchmark, isCalibratedBenchmark, isCourseLessonAvailable, nextCourseLesson, placementLevel, practiceOnly, rankedPairs, recommendedLevel, reviewKeysForResult } from '@/lib/learning'
import { buildSessionResult, type KeyEntry } from '@/lib/metrics'
import { defaultState } from '@/lib/storage'
import type { Layout, SessionResult } from '@/types'

const start = Date.parse('2026-11-23T12:00:00Z')
const day = 86_400_000
const homeRow = lessonsFor('ru')[0]
const confuse = { expected: 'ф', actual: 'а' }
const stableKey = { attempts: 5, errors: 0, latencyMs: 0, latencySamples: 0 }

function session(values: Partial<SessionResult> = {}): SessionResult {
  return {
    schemaVersion: 1, id: 'record', startedAt: new Date(start).toISOString(), endedAt: new Date(start).toISOString(),
    mode: 'lesson', layout: 'ru', level: 1, activeMs: 25_000, wallMs: ASSESSMENT_MS, totalKeys: 110,
    correctChars: 110, errors: 0, backspaces: 0, bestStreak: 100, cpm: 145, wpm: 29, accuracy: 100,
    meanLatencyMs: 0, p95LatencyMs: 0, score: 0, keyStats: {}, confusions: {}, samples: [],
    ...values,
  }
}

function pacedDiagnostic(layout: Layout, wpm: number, typo?: { expected: string; actual: string }): SessionResult {
  const assessment = getAssessmentText(layout, 'diagnostic', new Date(start))
  const length = Math.ceil(wpm * 5 * ASSESSMENT_MS / 60_000)
  const entries: KeyEntry[] = Array.from(assessment.text.slice(0, length), (expected, index) => ({
    at: start + Math.round((index + 1) * ASSESSMENT_MS / (length + 1)), expected, actual: expected, correct: true,
  }))
  if (typo) {
    const index = entries.findIndex(({ expected }) => expected.toLowerCase() === typo.expected)
    const target = entries[index]
    entries.splice(index, 0, { ...target, at: target.at - 1, actual: typo.actual, correct: false })
  }
  const result = buildSessionResult({
    id: 'diagnostic-prefix', startedAt: new Date(start), endedAt: new Date(start + ASSESSMENT_MS),
    entries, correctChars: length, errors: typo ? 1 : 0, backspaces: 0, bestStreak: length,
    mode: 'diagnostic', layout, level: 0, paceWindowMs: ASSESSMENT_MS,
  })
  return { ...result, assessmentId: assessment.id }
}

describe('контрольный замер и старт курса', () => {
  it('отводит место недели только согласованному 45-секундному замеру', () => {
    const assessment = getAssessmentText('ru', 'benchmark', new Date(start))
    const attempt = session({
      mode: 'benchmark', assessmentId: assessment.id, weekKey: assessment.week,
      endedAt: new Date(start + ASSESSMENT_MS).toISOString(),
    })
    const short = { ...attempt, wallMs: ASSESSMENT_MS - 1, endedAt: new Date(start + ASSESSMENT_MS - 1).toISOString() }
    const contradictory = { ...attempt, endedAt: attempt.startedAt }
    const wrongWeek = {
      ...attempt, startedAt: new Date(start + 7 * day).toISOString(),
      endedAt: new Date(start + 7 * day + ASSESSMENT_MS).toISOString(),
    }
    expect(acceptsAssessment(attempt)).toBe(true)
    expect(isCalibratedBenchmark(attempt)).toBe(true)
    for (const invalid of [short, contradictory, wrongWeek, { ...attempt, correctChars: 4 }, { ...attempt, layout: 'en' as const }]) {
      expect(acceptsAssessment(invalid)).toBe(false)
      expect(isAcceptedBenchmark(invalid)).toBe(false)
    }
    const state = { ...defaultState(), sessions: [short, contradictory] }
    expect(benchmarkForWeek(state, 'ru', assessment.week)).toBeUndefined()
    expect(benchmarkForWeek({ ...state, sessions: [...state.sessions, attempt] }, 'ru', assessment.week)).toBe(attempt)
    expect(benchmarkForWeek({ ...state, sessions: [attempt] }, 'en', assessment.week)).toBeUndefined()

    const legacy = { ...attempt, assessmentId: 'benchmark-ru-v1-' + assessment.week }
    expect(isAcceptedBenchmark(legacy)).toBe(true)
    expect(isCalibratedBenchmark(legacy)).toBe(false)
    expect(benchmarkForWeek({ ...state, sessions: [legacy] }, 'ru', assessment.week)).toBe(legacy)
  })

  it('относит переход через понедельник к неделе начала замера', () => {
    const sunday = new Date('2026-11-29T23:59:50Z')
    const assessment = getAssessmentText('ru', 'benchmark', sunday)
    const attempt = session({
      mode: 'benchmark', assessmentId: assessment.id, weekKey: '2026-W48',
      startedAt: sunday.toISOString(), endedAt: new Date(+sunday + ASSESSMENT_MS).toISOString(),
    })
    const state = { ...defaultState(), sessions: [attempt] }
    expect(benchmarkForWeek(state, 'ru', '2026-W48')).toBe(attempt)
    expect(benchmarkForWeek(state, 'ru', '2026-W49')).toBeUndefined()
  })

  it('считает темп контроля по всем 45 секундам', () => {
    const entries = Array.from({ length: 75 }, (_, index) => ({ at: start + index * 100, expected: 'а', actual: 'а', correct: true }))
    const result = buildSessionResult({
      id: 'fixed-time', startedAt: new Date(start), endedAt: new Date(start + ASSESSMENT_MS),
      entries, correctChars: 75, errors: 0, backspaces: 0, bestStreak: 75, mode: 'benchmark',
      layout: 'ru', level: 0, paceWindowMs: ASSESSMENT_MS,
    })
    expect(result.activeMs).toBe(7400)
    expect(result.wpm).toBe(20)
  })

  it.each([
    ['ru', 'ф', 'а'],
    ['en', ';', 'l'],
  ] as const)('проверяет вводные клавиши %s в пределах реального окна диагностики', (layout, expected, actual) => {
    for (const lesson of lessonsFor(layout).slice(0, 6)) {
      expect(recommendedLevel(pacedDiagnostic(layout, lesson.targetWpm))).toBe(lesson.level + 1)
    }
    expect(recommendedLevel(pacedDiagnostic(layout, 30))).toBe(7)
    const wrongTarget = pacedDiagnostic(layout, 30, { expected, actual })
    expect(wrongTarget.accuracy).toBeGreaterThan(95)
    expect(recommendedLevel(wrongTarget)).toBe(1)
  })

  it('переносит старт только по реально проверенным клавишам до первого урока', () => {
    const diagnostic = session({
      mode: 'diagnostic', assessmentId: getAssessmentText('ru', 'diagnostic', new Date(start)).id,
      endedAt: new Date(start + ASSESSMENT_MS).toISOString(),
      keyStats: Object.fromEntries(homeRow.keys.split(' ').map((key) => [key, stableKey])),
    })
    const state = { ...defaultState(), sessions: [diagnostic] }
    const course = lessonsFor('ru')
    expect(nextCourseLesson(state, 'ru').level).toBe(2)
    expect(isCourseLessonAvailable(course[2], state)).toBe(false)
    expect(state.lessonProgress).toEqual({})
    expect(nextCourseLesson(state, 'en').level).toBe(1)
    const storedV1 = { ...diagnostic, assessmentId: 'diagnostic-ru-v1' }
    expect(nextCourseLesson({ ...state, sessions: [storedV1] }, 'ru').level).toBe(2)
    expect(acceptsAssessment({ ...storedV1, layout: 'en' })).toBe(false)
    const invalidLater = { ...diagnostic, startedAt: new Date(start + day).toISOString(), endedAt: new Date(start + day).toISOString() }
    expect(nextCourseLesson({ ...state, sessions: [storedV1, invalidLater] }, 'ru').level).toBe(2)
    const missingKey = { ...diagnostic, keyStats: { ...diagnostic.keyStats, ф: { ...stableKey, attempts: 1 } } }
    expect(nextCourseLesson({ ...state, sessions: [missingKey] }, 'ru').level).toBe(1)
    const earlierLesson = session({ id: 'old', lessonId: homeRow.id, startedAt: new Date(start - day).toISOString() })
    expect(placementLevel({ ...state, sessions: [{ ...earlierLesson, completedText: false }, diagnostic] }, 'ru')).toBe(2)
    const savedCourse = { [homeRow.id]: { attempts: 1, completed: true, bestWpm: 29, bestAccuracy: 100 } }
    expect(placementLevel({ ...state, lessonProgress: savedCourse, sessions: [earlierLesson, diagnostic] }, 'ru')).toBe(1)
  })

  it('отделяет замеры и специальные упражнения от обычных тренировок для достижений', () => {
    const regular = session({ mode: 'precision' })
    const special = (['diagnostic', 'benchmark', 'transition', 'transfer-practice', 'transfer-control', 'layout-switch'] as const)
      .map((mode) => session({ mode }))
    const state = { ...defaultState(), sessions: [regular, ...special] }
    expect(practiceOnly(state).sessions).toEqual([regular])
  })
})

describe('очередь повторов', () => {
  const erroneous = session({ errors: 5, confusions: { 'ф->а': 3, 'а->ц': 2 } })
  const finishedReview = (afterDays: number, completedText = true) => session({
    mode: 'review', id: 'review-' + afterDays, endedAt: new Date(start + afterDays * day).toISOString(),
    completedText, reviewPairs: [confuse], keyStats: { ф: stableKey, а: stableKey },
  })

  it('сохраняет исходные пары подсказки после открытия следующего урока', () => {
    const origin = session({ lessonId: homeRow.id, completedText: true, confusions: { 'ф->а': 1, 'ф->п': 2 } })
    const initial = { ...defaultState(), sessions: [origin] }
    const passed = { ...initial, lessonProgress: { [homeRow.id]: { attempts: 1, completed: true, bestWpm: 29, bestAccuracy: 100 } } }
    expect(nextCourseLesson(passed, 'ru').level).toBe(2)
    for (const state of [initial, passed]) {
      expect(rankedPairs(origin, reviewKeysForResult(state, origin))).toEqual([{ ...confuse, count: 1 }])
    }
  })

  it('назначает первичный повтор по знакомой на тот момент клавише', () => {
    const historical = session({ id: 'legacy-early', lessonId: homeRow.id, completedText: false, confusions: { 'а->п': 2 } })
    const passedAt = start + 2 * day
    const passing = session({
      id: 'pass', lessonId: homeRow.id, startedAt: new Date(passedAt - 30_000).toISOString(),
      endedAt: new Date(passedAt).toISOString(), completedText: true,
    })
    const state = {
      ...defaultState(), sessions: [historical, passing],
      lessonProgress: { [homeRow.id]: { attempts: 2, completed: true, bestWpm: 29, bestAccuracy: 100 } },
    }
    expect(nextCourseLesson(state, 'ru').level).toBe(2)
    expect(dueReviewItems(state, 'ru', passedAt)).toEqual([])
    const practicedAt = passedAt + 60_000
    const exposed = session({
      id: 'after-pass', mode: 'adaptive', startedAt: new Date(practicedAt - 30_000).toISOString(),
      endedAt: new Date(practicedAt).toISOString(), confusions: { 'а->п': 1 },
    })
    const withEvidence = { ...state, sessions: [...state.sessions, exposed] }
    expect(dueReviewItems(withEvidence, 'ru', practicedAt + day - 1)).toEqual([])
    expect(dueReviewItems(withEvidence, 'ru', practicedAt + day)).toEqual([
      { expected: 'а', actual: 'п', dueAt: practicedAt + day, intervalMs: day, status: 'new' },
    ])
  })

  it('назначает только знакомые клавиши и раздвигает уверенные повторы до 16 дней', () => {
    expect(rankedPairs(erroneous, new Set(['ф', 'а']))).toEqual([{ ...confuse, count: 3 }])
    const initial = { ...defaultState(), sessions: [erroneous] }
    expect(dueReviewPairs(initial, 'ru', start + day - 1)).toEqual([])
    expect(dueReviewPairs(initial, 'ru', start + day)).toEqual([confuse])
    expect(dueReviewPairs(initial, 'en', start + day)).toEqual([])
    const first = { ...initial, sessions: [erroneous, finishedReview(1)] }
    expect(dueReviewPairs(first, 'ru', start + 4 * day - 1)).toEqual([])
    expect(dueReviewPairs(first, 'ru', start + 4 * day)).toEqual([confuse])
    const second = { ...initial, sessions: [...first.sessions, finishedReview(4)] }
    expect(dueReviewPairs(second, 'ru', start + 11 * day - 1)).toEqual([])
    expect(dueReviewPairs(second, 'ru', start + 11 * day)).toEqual([confuse])
    const stable = { ...initial, sessions: [...second.sessions, finishedReview(11)] }
    expect(dueReviewPairs(stable, 'ru', start + 27 * day - 1)).toEqual([])
    expect(dueReviewItems({ ...stable, sessions: [...stable.sessions].reverse() }, 'ru', start + 27 * day)).toEqual([
      { ...confuse, dueAt: start + 27 * day, intervalMs: 16 * day, status: 'stable' },
    ])
  })

  it('растит умеренную практику медленнее, а короткая проба сохраняет заработанный интервал', () => {
    const adequate = { ...finishedReview(1), keyStats: { ф: { ...stableKey, attempts: 3 }, а: stableKey } }
    const state = { ...defaultState(), sessions: [erroneous, adequate] }
    expect(dueReviewPairs(state, 'ru', start + 3 * day - 1)).toEqual([])
    expect(dueReviewItems(state, 'ru', start + 3 * day)).toEqual([
      { ...confuse, dueAt: start + 3 * day, intervalMs: 2 * day, status: 'building' },
    ])
    const brief = { ...finishedReview(3), keyStats: { ф: { ...stableKey, attempts: 2 }, а: stableKey } }
    const insufficient = { ...state, sessions: [...state.sessions, brief] }
    expect(dueReviewItems(insufficient, 'ru', start + 4 * day)).toEqual([
      { ...confuse, dueAt: start + 4 * day, intervalMs: 2 * day, status: 'insufficient' },
    ])
    const recovered = { ...insufficient, sessions: [...insufficient.sessions, finishedReview(4)] }
    expect(dueReviewPairs(recovered, 'ru', start + 9 * day - 1)).toEqual([])
    expect(dueReviewItems(recovered, 'ru', start + 9 * day)).toEqual([
      { ...confuse, dueAt: start + 9 * day, intervalMs: 5 * day, status: 'building' },
    ])
  })

  it('сокращает накопленный интервал после ошибки и вторую ошибку предлагает разобрать через 12 часов', () => {
    const state = { ...defaultState(), sessions: [erroneous, finishedReview(1), finishedReview(4), finishedReview(11)] }
    const recurrence = session({ id: 'recurrence', endedAt: new Date(start + 12 * day).toISOString(), confusions: { 'ф->а': 1 } })
    const shortened = { ...state, sessions: [...state.sessions, recurrence] }
    expect(dueReviewPairs(shortened, 'ru', start + 13 * day - 1)).toEqual([])
    expect(dueReviewItems(shortened, 'ru', start + 13 * day)).toEqual([
      { ...confuse, dueAt: start + 13 * day, intervalMs: day, status: 'forgotten' },
    ])
    const failed = { ...finishedReview(13), confusions: { 'ф->а': 1 } }
    const next = { ...shortened, sessions: [...shortened.sessions, failed] }
    expect(dueReviewPairs(next, 'ru', start + 13.5 * day - 1)).toEqual([])
    expect(dueReviewItems(next, 'ru', start + 13.5 * day)).toEqual([
      { ...confuse, dueAt: start + 13.5 * day, intervalMs: day / 2, status: 'forgotten' },
    ])
  })

  it('сбрасывает только перепутанную пару и сохраняет интервал другой пары с общей клавишей', () => {
    const otherPair = { expected: 'ф', actual: 'о' }
    const pairs = [confuse, otherPair]
    const initial = { ...erroneous, confusions: { 'ф->а': 1, 'ф->о': 1 } }
    const review = (afterDays: number) => ({
      ...finishedReview(afterDays), reviewPairs: pairs, keyStats: { ф: stableKey, а: stableKey, о: stableKey },
    })
    const lapse = { ...review(27), confusions: { 'ф->о': 2 },
      keyStats: { ф: { ...stableKey, attempts: 14, errors: 2 }, а: stableKey, о: stableKey } }
    const state = { ...defaultState(), sessions: [initial, review(1), review(4), review(11), lapse] }
    expect(dueReviewItems(state, 'ru', start + 28 * day)).toEqual([
      { ...confuse, dueAt: start + 28 * day, intervalMs: 16 * day, status: 'insufficient' },
      { ...otherPair, dueAt: start + 28 * day, intervalMs: day, status: 'forgotten' },
    ])
    const recovered = { ...state, sessions: [...state.sessions, review(28)] }
    expect(dueReviewItems(recovered, 'ru', start + 31 * day)).toEqual([
      { ...otherPair, dueAt: start + 31 * day, intervalMs: 3 * day, status: 'building' },
    ])
    expect(dueReviewItems(recovered, 'ru', start + 58 * day).find(({ actual }) => actual === 'а')).toEqual(
      { ...confuse, dueAt: start + 58 * day, intervalMs: 30 * day, status: 'stable' },
    )
  })

  it('отличает незаконченный и досрочный повтор от уверенного и возвращает ошибку на завтра', () => {
    const early = finishedReview(0.5)
    const incomplete = finishedReview(1, false)
    const state = { ...defaultState(), sessions: [erroneous, early, incomplete] }
    expect(dueReviewPairs(state, 'ru', start + day)).toEqual([confuse])
    const failed = { ...finishedReview(1), confusions: { 'ф->а': 1 } }
    expect(dueReviewPairs({ ...state, sessions: [...state.sessions, failed] }, 'ru', start + day)).toEqual([])
    expect(dueReviewPairs({ ...state, sessions: [...state.sessions, failed] }, 'ru', start + 2 * day)).toEqual([confuse])
  })
  it.each(['diagnostic', 'benchmark', 'orbit', 'sprint'] as const)(
    'не назначает повтор по ошибкам режима %s', (mode) => {
      const state = { ...defaultState(), sessions: [{ ...erroneous, mode }] }
      expect(dueReviewPairs(state, 'ru', start + day)).toEqual([])
    },
  )

  it.each([
    ['ф', { ...stableKey, attempts: 2 }],
    ['а', { ...stableKey, attempts: 20, errors: 3 }],
  ] as const)('не продвигает очередность при слабых данных по клавише %s', (key, stat) => {
    const review = finishedReview(1)
    const weak = { ...review, keyStats: { ...review.keyStats, [key]: stat } }
    const state = { ...defaultState(), sessions: [erroneous, weak] }
    expect(weak.confusions).toEqual({})
    expect(dueReviewPairs(state, 'ru', start + 2 * day - 1)).toEqual([])
    expect(dueReviewPairs(state, 'ru', start + 2 * day)).toEqual([confuse])
    const clean = { ...state, sessions: [erroneous, review] }
    expect(dueReviewPairs(clean, 'ru', start + 2 * day)).toEqual([])
    expect(dueReviewPairs(clean, 'ru', start + 4 * day)).toEqual([confuse])
  })

})
