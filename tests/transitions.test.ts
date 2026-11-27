import { describe, expect, it } from 'vitest'
import { buildSessionResult, type KeyEntry } from '@/lib/metrics'
import { collectTransitions, compareTransitionAttempt, generateTransitionDrill, slowTransitions, transitionOverview } from '@/lib/transitions'
import type { SessionResult } from '@/types'

const origin = Date.parse('2026-11-19T12:00:00Z')
const fill = (value: number) => Array.from({ length: 8 }, () => value)
const pair = { from: 'a', to: 's' }

function record(id: string, offset: number, overrides: Partial<SessionResult> = {}): SessionResult {
  const startedAt = new Date(origin + offset * 60_000)
  return {
    ...buildSessionResult({
      id, startedAt, endedAt: new Date(+startedAt + 10_000), entries: [], correctChars: 0, errors: 0,
      backspaces: 0, bestStreak: 0, mode: 'lesson', layout: 'en', level: 1,
    }),
    ...overrides,
  }
}

function entry(expected: string, at: number, overrides: Partial<KeyEntry> = {}): KeyEntry {
  return { at, expected, actual: expected, correct: true, ...overrides }
}

describe('замер переходов между буквами', () => {
  it('мерит соседние правильные буквы и прерывает цепочку на ошибке, исправлении, пробеле и паузе', () => {
    const entries = [
      entry('А', 0), entry('с', 150),
      entry('д', 200, { actual: 'ж', correct: false }), entry('д', 350),
      entry('Backspace', 400, { backspace: true }), entry('А', 450),
      entry(' ', 500), entry('с', 650), entry('с', 800),
      entry('a', 850), entry('д', 900), entry('ё', 950, { unattributed: true }),
      entry('А', 1050), entry('ё', 4051), entry('ф', 7051),
    ]
    expect(collectTransitions(entries, 'ru', 3000)).toEqual({
      'а->с': [150], 'с->с': [150], 'ё->ф': [3000],
    })
    expect(collectTransitions(entries, 'en', 3000)).toEqual({})
  })

  it('ограничивает сохранённые замеры одного перехода последними 24 интервалами', () => {
    let at = 0
    const entries = [entry('s', at)]
    for (let index = 1; index <= 30; index++) {
      at += index
      entries.push(entry('s', at))
    }
    expect(collectTransitions(entries, 'en', 3000)['s->s']).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 7),
    )
  })

  it('выбирает относительно медленный переход по нескольким тренировкам и сравнивает два окна', () => {
    const prior = Array.from({ length: 6 }, (_, index) => record('old-' + index, -40 + index, {
      transitions: { 'a->s': [430, 440], 'd->f': [100, 110], 'j->k': [130, 140] },
    }))
    const recent = Array.from({ length: 6 }, (_, index) => record('new-' + index, -20 + index, {
      transitions: {
        'a->s': [260, index === 0 ? 2999 : 270], 'd->f': [100, 110], 'j->k': [130, 140],
        ...(index === 0 ? { 'q->w': fill(500) } : {}),
      },
    }))
    const other = [
      record('legacy', -5),
      record('game', -5, { mode: 'orbit', transitions: { 'q->w': fill(1000) } }),
      record('review', -6, { mode: 'review', transitions: { 'q->w': fill(1000) } }),
      record('drill', -7, { mode: 'transition', transitions: { 'q->w': fill(1000) } }),
      record('ru', -7, { layout: 'ru', transitions: { 'q->w': fill(1000) } }),
      record('future', 20, { transitions: { 'a->s': fill(2900) } }),
    ]
    expect(slowTransitions([...recent, ...prior, ...other], 'en', 4, origin)).toEqual([{
      ...pair, samples: 12, medianMs: 265, previousSamples: 12, previousMedianMs: 435,
      previousSource: 'practice', changeMs: -170,
    }])
  })

  it('различает спокойный измеренный ритм и нехватку замеров из нескольких тренировок', () => {
    const first = record('even-first', -2, { transitions: { 'a->s': fill(140), 's->a': fill(160) } })
    const second = record('even-second', -1, { transitions: { 'a->s': fill(140), 's->a': fill(160) } })
    expect(transitionOverview([first], 'en', origin)).toEqual({ baselineReady: false, slow: [] })
    expect(transitionOverview([first, second], 'en', origin)).toEqual({ baselineReady: true, slow: [] })
  })

  it('сравнивает упражнения на ту же пару и показывает обычный набор как другой контекст без разницы', () => {
    const practice = [-40, -39].map((offset) => record('normal-' + offset, offset, { transitions: { 'a->s': [400, 420, 410, 430] } }))
    const older = record('same-drill', -30, { mode: 'transition', transitionPairs: [pair], transitions: { 'a->s': fill(300) } })
    const other = record('other-drill', -20, {
      mode: 'transition', transitionPairs: [{ from: 's', to: 'a' }], transitions: { 'a->s': fill(550) },
    })
    const current = record('current', 0, { mode: 'transition', transitionPairs: [pair], transitions: { 'a->s': fill(225) } })
    const future = { ...older, id: 'future', endedAt: new Date(origin + 500).toISOString(), transitions: { 'a->s': fill(900) } }
    expect(compareTransitionAttempt([...practice, older, other, current, future], current)).toEqual([{
      ...pair, samples: 8, medianMs: 225, previousSamples: 8, previousMedianMs: 300, previousSource: 'drill', changeMs: -75,
    }])
    expect(compareTransitionAttempt(practice, current)).toEqual([{
      ...pair, samples: 8, medianMs: 225, previousSamples: 8, previousMedianMs: 415, previousSource: 'practice',
    }])
    expect(compareTransitionAttempt(practice, { ...current, transitions: { 'a->s': [100, 120] } })).toEqual([])
  })

  it('строит упражнение из знакомых букв с минимум восемью повторами каждой выбранной пары', () => {
    const known = new Set(['a', 's', 'd', 'f', 'j', 'k', 'l', ';'])
    const pairs = [pair, { from: 's', to: 's' }, { from: 'z', to: 'k' }, pair, { from: 'a', to: ';' }]
    const drill = generateTransitionDrill('en', known, pairs, 'short', 418)
    expect(drill).toBeDefined()
    expect(drill?.pairs).toEqual([pair, { from: 's', to: 's' }])
    expect(drill?.keys).toEqual(['a', 's'])
    const words = drill!.text.split(' ')
    expect(words.filter((word) => word.includes('as')).length).toBeGreaterThanOrEqual(8)
    expect(words.filter((word) => word.includes('ss')).length).toBeGreaterThanOrEqual(8)
    expect([...drill!.text].every((char) => char === ' ' || known.has(char))).toBe(true)
    expect(generateTransitionDrill('en', known, pairs, 'short', 418)).toEqual(drill)
    expect(generateTransitionDrill('ru', known, pairs, 'short', 418)).toBeUndefined()
  })
})
