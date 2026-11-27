import { describe, expect, it, vi } from 'vitest'
import { buildSessionResult, calculateActiveMs, percentile, type KeyEntry } from '../src/lib/metrics'
import { aggregate, dailySeries, speedTrend, weakKeys } from '../src/lib/analytics'
import { generateAdaptiveText, generateLessonText, isUnlocked, lessons, lessonsFor } from '../src/data/lessons'
import { defaultState, sessionsToCsv } from '../src/lib/storage'
import type { SessionResult } from '../src/types'

const entries: KeyEntry[] = [
  { at: 0, expected: 'ф', actual: 'ф', correct: true },
  { at: 200, expected: 'ы', actual: 'а', correct: false },
  { at: 400, expected: 'ы', actual: 'ы', correct: true },
  { at: 5400, expected: ' ', actual: ' ', correct: true },
]

describe('метрики тренировки', () => {
  it('исключает паузы дольше трёх секунд из активного времени', () => {
    expect(calculateActiveMs(entries)).toBe(400)
  })
  it('считает WPM, точность, задержки и перепутанные клавиши', () => {
    const result = buildSessionResult({ id: 'one', startedAt: new Date(0), endedAt: new Date(6000), entries, correctChars: 3, errors: 1, backspaces: 0, bestStreak: 2, mode: 'lesson', layout: 'ru', level: 1 })
    expect(result.activeMs).toBe(400)
    expect(result.wpm).toBe(90)
    expect(result.accuracy).toBe(75)
    expect(result.confusions['ы->а']).toBe(1)
    expect(result.keyStats['ы'].attempts).toBe(2)
    expect(result.p95LatencyMs).toBe(200)
  })
  it('устойчиво считает перцентили и пустой ввод', () => {
    expect(percentile([], 95)).toBe(0)
    expect(percentile([100, 200, 300, 400], 95)).toBe(400)
  })
})

function session(id: string, day: number, wpm: number, key = 'ф', errors = 0): SessionResult {
  return { schemaVersion: 1, id, startedAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`, endedAt: `2026-11-${String(day).padStart(2, '0')}T10:01:00Z`, mode: 'lesson', layout: 'ru', level: 1, activeMs: 60000, wallMs: 60000, totalKeys: 100, correctChars: 100, errors, backspaces: 0, bestStreak: 100, cpm: wpm * 5, wpm, accuracy: 100 - errors, meanLatencyMs: 500, p95LatencyMs: 800, score: 1000, keyStats: { [key]: { attempts: 10, errors, latencyMs: 4000, latencySamples: 10 } }, confusions: {}, samples: [] }
}

describe('аналитика прогресса', () => {
  it('считает точность по нажатиям, а скорость по оставшимся знакам после Backspace', () => {
    const corrected = buildSessionResult({
      id: 'corrected',
      startedAt: new Date(0),
      endedAt: new Date(1000),
      entries: [
        { at: 0, expected: 'ф', actual: 'ф', correct: true },
        { at: 250, expected: 'ф', actual: 'Backspace', correct: true, backspace: true },
        { at: 500, expected: 'ф', actual: 'ф', correct: true },
        { at: 750, expected: 'ы', actual: 'а', correct: false },
        { at: 1000, expected: 'ы', actual: 'ы', correct: true },
      ],
      correctChars: 2,
      errors: 1,
      backspaces: 1,
      bestStreak: 1,
      mode: 'lesson',
      layout: 'ru',
      level: 1,
    })
    expect(aggregate([corrected])).toMatchObject({ correct: 2, wpm: 24, accuracy: 75 })
  })
  it('вычисляет положительный недельный тренд', () => {
    expect(speedTrend([session('1', 1, 20), session('2', 8, 27), session('3', 15, 34)]).wpmPerWeek).toBe(7)
  })
  it('ранжирует слабые клавиши по ошибкам и задержке', () => {
    const keys = weakKeys([session('1', 1, 20, 'ф', 4), session('2', 2, 21, 'ы', 1)])
    expect(keys[0].key).toBe('ф')
    expect(keys[0].errorRate).toBe(40)
  })
  it('показывает всю историю быстрого чистого набора без мнимых слабых клавиш', () => {
    const clean = (id: string, ended: Date) => ({
      ...session(id, 1, 60),
      startedAt: new Date(ended.getTime() - 60_000).toISOString(),
      endedAt: ended.toISOString(),
      totalKeys: 300,
      correctChars: 300,
    })
    const history = [
      clean('recent', new Date(2026, 10, 26, 12)),
      clean('old', new Date(2025, 0, 12, 12)),
      clean('old-repeat', new Date(2025, 0, 12, 18)),
    ]

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 10, 27, 12))
      const allTime = dailySeries(history, 0)
      expect(allTime).toMatchObject([
        { date: '2025-01-12', sessions: 2, wpm: 60 },
        { date: '2026-11-26', sessions: 1, wpm: 60 },
      ])
      expect(allTime[0].label).toContain('2025')
      expect(dailySeries(history, 7)).toHaveLength(7)
      expect(dailySeries(history, 30).filter(({ sessions }) => sessions > 0)).toHaveLength(1)
      expect(weakKeys(history)).toEqual([])
      expect(generateAdaptiveText('ru', history, 'short', 1)).toMatchObject({ keys: [], difficulty: 'интенсив' })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('программа уроков', () => {
  it('содержит 12 русских и 12 английских уникальных уровней', () => {
    expect(lessons).toHaveLength(24)
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(24)
    expect(lessonsFor('ru')).toHaveLength(12)
    expect(lessonsFor('en')).toHaveLength(12)
  })
  it('блокирует следующий урок до прохождения предыдущего', () => {
    const state = defaultState()
    expect(isUnlocked(lessonsFor('ru')[0], state)).toBe(true)
    expect(isUnlocked(lessonsFor('ru')[1], state)).toBe(false)
    state.lessonProgress['ru-01'] = { attempts: 1, completed: true, bestWpm: 20, bestAccuracy: 96 }
    expect(isUnlocked(lessonsFor('ru')[1], state)).toBe(true)
  })
  it('генерирует достаточный текст и сохраняет детерминизм по seed', () => {
    const lesson = lessonsFor('ru')[0]
    expect(generateLessonText(lesson, 'short', 42)).toBe(generateLessonText(lesson, 'short', 42))
    expect(generateLessonText(lesson, 'short', 42).length).toBeGreaterThan(80)
  })
  it('экспортирует корректный CSV с BOM', () => {
    const csv = sessionsToCsv([session('1', 1, 20)])
    expect(csv.startsWith('\uFEFFid,')).toBe(true)
    expect(csv).toContain('"2026-11-01T10:01:00Z"')
  })
})
