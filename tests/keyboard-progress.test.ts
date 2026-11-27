import { describe, expect, it } from 'vitest'
import { buildProgressReport, generateHardcore, keyboardProgress } from '@/lib/keyboardProgress'
import { buildSessionResult, type KeyEntry } from '@/lib/metrics'
import { defaultState } from '@/lib/storage'
import type { Layout, SessionMode, SessionResult } from '@/types'

const now = new Date('2026-12-01T12:00:00Z')
const day = 86_400_000

type Stroke = Omit<KeyEntry, 'at'>

function strokes(expected: string, attempts: number, errors = 0, mistyped = expected === 's' ? 'd' : 's'): Stroke[] {
  return Array.from({ length: attempts }, (_, index) => ({
    expected, actual: index < errors ? mistyped : expected, correct: index >= errors,
  }))
}

function record(id: string, layout: Layout, ageDays: number, input: Stroke[], mode: SessionMode = 'lesson'): SessionResult {
  const endedAt = new Date(+now - ageDays * day)
  const startedAt = new Date(+endedAt - 20_000)
  const entries = input.map((entry, index) => ({ ...entry, at: +startedAt + index * 100 }))
  const correctChars = input.filter(({ correct }) => correct).length
  return buildSessionResult({
    id, layout, mode, startedAt, endedAt, entries, level: 1, correctChars,
    errors: input.length - correctChars, backspaces: 0, bestStreak: correctChars,
  })
}

function glyph(history: SessionResult[], layout: Layout, key: string) {
  return keyboardProgress(history, layout, now).keyboard.find(({ glyph }) => glyph === key)!
}

describe('посимвольный прогресс клавиатуры', () => {
  it('различает регистр, сохраняет фактические ошибочные символы и отмечает старые данные отдельно', () => {
    const exact = record('exact', 'en', 1, [
      ...strokes('a', 2), ...strokes('A', 2, 2, 'a'), ...strokes('A', 2, 1, 'S'),
      ...strokes('!', 1, 1, '1'), { expected: 'A', actual: 'A', correct: true, unattributed: true },
    ])
    const historic = record('historic', 'en', 2, strokes('a', 10, 2))
    const { symbolStats: _oldFormat, ...legacy } = historic

    expect(glyph([exact, legacy], 'en', 'a')).toMatchObject({
      all: { attempts: 2, correct: 2, errors: 0, misses: [] },
      legacy: { attempts: 10, correct: 8, errors: 2, misses: [] },
    })
    expect(glyph([exact, legacy], 'en', 'A')).toMatchObject({
      all: { attempts: 4, correct: 1, errors: 3, errorPercent: 75, misses: [['a', 2], ['S', 1]] },
      legacy: { attempts: 0 },
    })
    expect(glyph([exact], 'en', '!').all.misses).toEqual([['1', 1]])
    expect(glyph([exact], 'en', 'S').all.attempts).toBe(0)
  })

  it('сравнивает только точные обычные замеры с минимумом 10 в каждом из двух окон', () => {
    const current = record('current', 'en', 0, strokes('a', 10, 1))
    const previous = record('previous', 'en', 30, strokes('a', 10, 3))
    const tooOld = record('too-old', 'en', 60, strokes('a', 10, 5))
    const hardcore = record('hardcore', 'en', 1, strokes('a', 20, 15), 'hardcore')
    const previousHardcore = record('previous-hardcore', 'en', 30, strokes('a', 10, 9), 'hardcore')
    const legacyExact = record('legacy', 'en', 1, strokes('a', 10, 9))
    const { symbolStats: _oldFormat, ...legacy } = legacyExact
    const history = [current, previous, tooOld, hardcore, previousHardcore, legacy]

    expect(glyph(history, 'en', 'a')).toMatchObject({
      current: { attempts: 10, errors: 1 }, previous: { attempts: 10, errors: 3 },
      hardcore: { attempts: 20, errors: 15 }, legacy: { attempts: 10, errors: 9 }, changePoints: -20,
      hardcorePrevious: { attempts: 10, errors: 9 }, hardcoreChangePoints: -15,
    })
    const shortCurrent = record('short-current', 'en', 1, strokes('a', 9, 1))
    const shortPrevious = record('short-previous', 'en', 59, strokes('a', 9, 2))
    expect(glyph([shortCurrent, previous, hardcore, legacy], 'en', 'a').changePoints).toBeNull()
    expect(glyph([current, shortPrevious, tooOld], 'en', 'a').changePoints).toBeNull()
    const shortHardcore = record('short-hardcore', 'en', 30, strokes('a', 9, 8), 'hardcore')
    const { symbolStats: _legacyHardcoreFormat, ...legacyHardcore } = previousHardcore
    expect(glyph([current, previous, hardcore, shortHardcore, legacyHardcore], 'en', 'a')).toMatchObject({
      changePoints: -20,
      hardcorePrevious: { attempts: 9, errors: 8 },
      hardcoreChangePoints: null,
    })
  })

  it('экспортирует оба алфавита и календарные границы без имени и исходного текста', () => {
    const state = defaultState()
    const profileName = 'PRIVATE-KEYBOARD-TEST-NAME'
    const sourceText = 'PRIVATE-KEYBOARD-TEST-PASSAGE'
    const report = buildProgressReport({
      ...state, settings: { ...state.settings, profileName },
      sessions: [
        { ...record('russian', 'ru', 2, strokes('ф', 10, 2, 'ы')), lessonTitle: sourceText },
        record('english', 'en', 1, strokes('a', 10, 1)),
      ],
    }, now)
    expect(report).toMatchObject({
      schema: 'takt.progress.v1', profileId: state.profileId, minimumPerPeriodForChange: 10,
      currentFrom: '2026-11-01T12:00:00.000Z', previousFrom: '2026-10-02T12:00:00.000Z',
    })
    expect(Object.keys(report.layouts).sort()).toEqual(['en', 'ru'])
    expect(report.layouts.ru.keyboard.find(({ glyph }) => glyph === 'ф')?.current).toMatchObject({ attempts: 10, errors: 2 })
    expect(report.layouts.en.keyboard.find(({ glyph }) => glyph === 'a')?.current).toMatchObject({ attempts: 10, errors: 1 })
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain(profileName)
    expect(serialized).not.toContain(sourceText)
  })
})

describe('Hardcore', () => {
  it('отдаёт 90% нажатий пяти частым ошибкам и сохраняет возвраты на домашний ряд', () => {
    const targetKeys = ['ф', 'ы', 'в', 'л', 'д']
    const ordinary = record('ordinary', 'ru', 1, [
      ...targetKeys.flatMap((key) => strokes(key, 4, 4, 'а')), ...strokes('о', 4, 1, 'а'), ...strokes('ж', 3, 3, 'а'),
    ])
    const recursive = record('drill', 'ru', 1, strokes('а', 30, 30, 'о'), 'hardcore')
    const result = generateHardcore([ordinary, recursive], 'ru', 11)!
    expect(new Set(result.targets)).toEqual(new Set(targetKeys))
    expect(generateHardcore([recursive], 'ru', 11)).toBeUndefined()

    const groups = result.text.split(' ')
    const movement = new Set<string>()
    expect(groups).toHaveLength(8)
    for (const group of groups) {
      const [anchor] = [...group].slice(-1)
      expect(group).toHaveLength(10)
      expect([...group.slice(0, -1)].every((key) => targetKeys.includes(key))).toBe(true)
      expect('аож').toContain(anchor)
      expect(targetKeys).not.toContain(anchor)
      movement.add(anchor)
    }
    expect(movement.size).toBeGreaterThan(1)
  })

  it('начинает упражнение с четырёх зарегистрированных попыток по ошибочной клавише', () => {
    const scarce = record('scarce', 'ru', 1, strokes('ж', 3, 3, 'а'))
    const enough = record('enough', 'ru', 1, strokes('ж', 4, 3, 'а'))
    expect(generateHardcore([scarce], 'ru', 0)).toBeUndefined()
    expect(generateHardcore([enough], 'ru', 0)?.targets).toEqual(['ж'])
  })
})
