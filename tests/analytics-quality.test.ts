import { describe, expect, it, vi } from 'vitest'
import { achievements } from '../src/data/achievements'
import { aggregate, dailySeries, observedSessions, periodDelta, speedTrend, weeklySpeedComparison } from '../src/lib/analytics'
import { hasTextPace, isLessonPaceSession, isPracticeActivityMode, isPracticePaceMode, lessonPaceObservation } from '../src/lib/sessionModes'
import { defaultState } from '../src/lib/storage'
import type { SessionResult } from '../src/types'

function session(day: number, minute: number, wpm: number, overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    schemaVersion: 1,
    id: `${day}-${minute}`,
    startedAt: new Date(2026, 10, day, 12, minute).toISOString(),
    endedAt: new Date(2026, 10, day, 12, minute + 1).toISOString(),
    mode: 'lesson',
    layout: 'ru',
    level: 1,
    activeMs: 60000,
    wallMs: 60000,
    totalKeys: 100,
    correctChars: 100,
    errors: 0,
    backspaces: 0,
    bestStreak: 100,
    cpm: wpm * 5,
    wpm,
    accuracy: 100,
    meanLatencyMs: 500,
    p95LatencyMs: 800,
    score: 1000,
    keyStats: {},
    confusions: {},
    samples: [],
    ...overrides,
  }
}

describe('practice pace quality', () => {
  it('requires eligible sessions on three distinct practice dates', () => {
    const sessions = [
      session(1, 0, 18),
      session(1, 4, 22),
      session(1, 8, 20),
      session(8, 0, 27),
    ]
    const tooShort = session(15, 0, 120, { activeMs: 9999, correctChars: 20 })
    const tooFew = session(15, 0, 120, { activeMs: 10000, correctChars: 19 })
    for (const rejected of [tooShort, tooFew]) {
      expect(speedTrend([...sessions, rejected])).toMatchObject({ samples: 2, ready: false })
    }
    expect(speedTrend([...sessions, session(15, 4, 24, { activeMs: 10000, correctChars: 20 })]))
      .toMatchObject({ samples: 3, ready: true })
  })

  it('weights each practice day once regardless of practice frequency', () => {
    const sessions = [session(1, 0, 10), session(1, 4, 30), session(3, 0, 30), session(8, 0, 34)]
    expect(speedTrend(sessions)).toMatchObject({ samples: 3, ready: true, wpmPerWeek: 12.4 })
  })

  it('keeps the pace of eligible lessons independent of slow exercises and partial attempts', () => {
    const lessons = [session(1, 0, 40), session(8, 0, 40, { completedText: true }), session(15, 0, 40, { completedText: true })]
    const others = [
      session(8, 4, 20, { mode: 'precision' }),
      session(15, 4, 20, { mode: 'precision' }),
      session(15, 8, 20, { mode: 'review' }),
    ]
    expect(speedTrend([...lessons, ...others]).wpmPerWeek).toBe(-6.7)
    const combined = [...lessons, ...others, session(15, 12, 100, { completedText: false }),
      session(15, 16, 100, { mode: 'orbit' }), session(15, 20, 100, { mode: 'hardcore' })]
    expect(combined.filter(isLessonPaceSession)).toEqual(lessons)
    expect(speedTrend(combined.filter(isLessonPaceSession))).toMatchObject({ samples: 3, ready: true, wpmPerWeek: 0 })
    expect(isLessonPaceSession(session(15, 24, 40, { activeMs: 9999 }))).toBe(false)
  })

  it('uses work after the warm-up for lesson pace and accuracy eligibility', () => {
    const lesson = session(1, 0, 30, {
      completedText: true, activeMs: 120000, correctChars: 600, totalKeys: 610, errors: 10,
      lessonScored: { activeMs: 60000, correctChars: 150, totalKeys: 155, errors: 5 },
    })
    expect(isLessonPaceSession(lesson)).toBe(true)
    const observation = lessonPaceObservation(lesson)
    expect(aggregate([observation])).toMatchObject({ wpm: 30, accuracy: 96.8, activeMs: 60000 })
    expect(lesson.activeMs).toBe(120000)
    expect(isLessonPaceSession({ ...lesson, lessonScored: { ...lesson.lessonScored!, correctChars: 19 } })).toBe(false)
  })

  it('counts focused practice while keeping controls and switch pace separate', () => {
    for (const mode of ['transition', 'transfer-practice', 'layout-switch', 'hardcore'] as const) {
      expect(isPracticeActivityMode(mode)).toBe(true)
      expect(isPracticePaceMode(mode)).toBe(false)
    }
    for (const mode of ['diagnostic', 'benchmark', 'transfer-control'] as const) {
      expect(isPracticeActivityMode(mode)).toBe(false)
    }
    expect(hasTextPace('hardcore')).toBe(true)
    expect(hasTextPace('layout-switch')).toBe(false)
  })

  it('leaves rest days blank while retaining measured zero pace and zero accuracy', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 10, 2, 14))
      const zero = session(2, 0, 0, { correctChars: 0, errors: 20, totalKeys: 20 })
      const [restDay, practiceDay] = dailySeries([zero], 2)
      expect(restDay).toMatchObject({ sessions: 0, minutes: 0, wpm: null, accuracy: null })
      expect(practiceDay).toMatchObject({ sessions: 1, minutes: 1, wpm: 0, accuracy: 0 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores missing, malformed, and future dates while retaining exact window boundaries', () => {
    vi.useFakeTimers()
    try {
      const now = new Date(2026, 10, 27, 14).getTime()
      const week = 7 * 86_400_000
      vi.setSystemTime(now)
      const past = (age: number) => session(1, 0, 0, {
        endedAt: new Date(now - age).toISOString(), correctChars: 0, errors: 20, totalKeys: 20,
      })
      const valid = [past(0), past(week), past(week + 1), past(2 * week), past(2 * week + 1)]
      const invalid = [
        past(-1),
        { ...past(1), endedAt: 'undated' },
        { ...past(1), endedAt: undefined } as unknown as SessionResult,
      ]
      expect(observedSessions([...valid, ...invalid])).toEqual(valid)
      expect(dailySeries(invalid, 0)).toEqual([])
      expect(speedTrend(invalid.map((item) => ({ ...item, wpm: 24, correctChars: 120, totalKeys: 120 }))))
        .toMatchObject({ samples: 0, ready: false })
      expect(weeklySpeedComparison([...invalid, past(week + 1)])).toContain('нужна практика')
      expect(weeklySpeedComparison([past(week), past(week + 1)])).toBe('0 сл/мин · последние 7 дней к предыдущим 7')
      expect(periodDelta([...valid, ...invalid])).toMatchObject({ current: { sessions: 2 }, previous: { sessions: 2 }, wpm: 0 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('counts only sustained pace towards speed achievements', () => {
    const state = defaultState()
    state.sessions = [session(1, 0, 120, { activeMs: 600, correctChars: 6 })]
    const speedAwards = achievements.filter(({ id }) => id === 'speed-40' || id === 'speed-60')
    expect(speedAwards.map((award) => award.value(state))).toEqual([0, 0])
    state.sessions.push(session(1, 4, 62, { activeMs: 12000, correctChars: 62 }))
    expect(speedAwards.map((award) => award.value(state))).toEqual([62, 62])
  })
})
