import { describe, expect, it } from 'vitest'
import { lessonsFor } from '../src/data/lessons'
import { assessmentWeekKey, benchmarkForm, generateConfusionDrill, generateLessonStages, getAssessmentText, lessonTextAllowance } from '../src/data/practiceTexts'
import { glyphRows } from '../src/lib/keyboardLayout'
import { scoreLesson, type KeyEntry } from '../src/lib/metrics'

const layouts = [
  ['ru', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'],
  ['en', 'abcdefghijklmnopqrstuvwxyz'],
] as const

describe('three-stage lessons', () => {
  it('uses only word and connected-text strokes for the scored pace and accuracy', () => {
    const entry = (position: number, at: number, correct: boolean): KeyEntry =>
      ({ position, at, expected: 'а', actual: correct ? 'а' : 'ф', correct })
    const attempts = [entry(0, 1000, false), entry(0, 1500, false), entry(0, 2000, true),
      entry(1, 2300, true), entry(2, 4000, true), entry(3, 4500, false), entry(3, 5000, true)]
    expect(scoreLesson(attempts, 4, 2)).toEqual({ correctChars: 2, activeMs: 1000, totalKeys: 3, errors: 1 })
    expect(scoreLesson(attempts.slice(0, 4), 2, 2)).toEqual({ correctChars: 0, activeMs: 0, totalKeys: 0, errors: 0 })
  })

  it.each(layouts)('trains the %s course with only introduced glyphs', (layout) => {
    const known = new Set([' '])
    for (const lesson of lessonsFor(layout)) {
      const introduced = lesson.keys.split(' ')
      introduced.forEach((key) => known.add(key))
      const passages = new Set<string>()
      for (const seed of [1, 2, 3, 11, 19, 31, 42, 64]) {
        const stages = generateLessonStages(lesson, 'normal', seed)
        expect(stages.map(({ kind }) => kind)).toEqual(['fingers', 'words', 'transfer'])
        for (const { text } of stages) {
          expect(text).not.toBe('')
          expect([...text.toLowerCase()].filter((glyph) => !known.has(glyph)), lesson.id).toEqual([])
          if (text !== text.toLowerCase()) expect(known.has('shift'), lesson.id).toBe(true)
        }
        const [fingers, words, transfer] = stages
        for (const key of introduced) {
          if (key === 'shift') expect(fingers.text).not.toBe(fingers.text.toLowerCase())
          else expect(fingers.text.toLowerCase()).toContain(key)
        }
        expect(transfer.text.trim().split(' ').length).toBeGreaterThanOrEqual(3)
        expect(words.text).not.toContain(transfer.text)
        passages.add(transfer.text)
      }
      expect(passages.size, lesson.id).toBeGreaterThan(1)
    }
  })

  it('keeps pace and the text burden within 15% for each later lesson, length and main stage', () => {
    expect(lessonTextAllowance(18.4, 16)).toBe(0)
    expect(lessonTextAllowance(16.8, 16)).toBe(9.5)
    let usedNoveltyAtFivePercent = false

    for (const [layout] of layouts) {
      const rows = glyphRows[layout]
      const requiresShift = (glyph: string) => rows.some(([, shifted]) => shifted.includes(glyph)) &&
        rows.every(([plain]) => !plain.includes(glyph))
      expect(requiresShift('?')).toBe(true)
      const known = new Set<string>()
      for (const lesson of lessonsFor(layout)) {
        const introduced = lesson.keys.split(' ')
        if (lesson.level > 1) {
          for (const length of ['short', 'normal', 'long'] as const) {
            for (const seed of [2, 31, 947]) {
              for (const pace of [16.8, 17.6, 18.4]) {
                const allowance = lessonTextAllowance(pace, 16)
                const [fingers, ...main] = generateLessonStages(lesson, length, seed, allowance)
                for (const { kind, text } of main) {
                  const cost = [...text].filter((glyph) => glyph !== ' ').reduce((sum, glyph) => {
                    return sum + Number(!known.has(glyph.toLowerCase())) + Number(requiresShift(glyph))
                  }, 0)
                  const ratio = cost / text.length
                  const label = [lesson.id, length, seed, pace, kind].join(' / ')
                  if (pace === 18.4) {
                    expect(text, label).not.toContain('?')
                    expect(cost, label).toBe(0)
                  }
                  expect(ratio, label).toBeLessThanOrEqual(allowance / 100 + 1e-12)
                  expect(pace / 16 * (1 + ratio), label).toBeLessThanOrEqual(1.15 + 1e-12)
                  if (pace === 16.8 && cost > 0) usedNoveltyAtFivePercent = true
                }
                if (pace === 18.4) {
                  for (const key of introduced) {
                    if (key === 'shift') expect(fingers.text, lesson.id).not.toBe(fingers.text.toLowerCase())
                    else expect(fingers.text.toLowerCase(), lesson.id).toContain(key)
                  }
                }
              }
            }
          }
        }
        introduced.forEach((key) => known.add(key))
      }
    }
    expect(usedNoveltyAtFivePercent).toBe(true)
  })

  it.each(layouts)('at the +15% step, puts each %s digit and introduced sign in a contextual group', (layout) => {
    const lesson = lessonsFor(layout).at(-1)!
    const [fingers] = generateLessonStages(lesson, 'short', 42, 0)
    const groups = fingers.text.split(' ').filter((word) =>
      !word.includes(layout === 'ru' ? 'а' : 'f') && /[0-9]/.test(word) && /[0-9%:]{2,}/.test(word) && new Set(word).size > 1)
    for (const glyph of '0123456789%:') expect(groups.some((word) => word.includes(glyph)), glyph).toBe(true)
  })
})

describe('assessment texts', () => {
  it('uses ISO weeks and a UTC rollover', () => {
    expect(assessmentWeekKey(new Date('2026-01-04T23:59:59.999Z'))).toBe('2026-W01')
    expect(assessmentWeekKey(new Date('2026-01-05T00:00:00Z'))).toBe('2026-W02')
    expect(assessmentWeekKey(new Date('2027-01-01T08:00:00Z'))).toBe('2026-W53')
    expect(assessmentWeekKey(new Date('2027-01-04T08:00:00Z'))).toBe('2027-W01')
  })

  it.each(layouts)('rotates %s benchmarks with unchanged size and glyph counts', (layout, alphabet) => {
    const weekOne = new Date('2026-11-23T08:00:00Z')
    const weekTwo = new Date('2026-11-30T08:00:00Z')
    const glyphs = alphabet + '0123456789.,!?:%'
    const first = getAssessmentText(layout, 'benchmark', weekOne)
    const same = getAssessmentText(layout, 'benchmark', new Date('2026-11-29T23:59:59Z'))
    const later = getAssessmentText(layout, 'benchmark', weekTwo)
    expect(first).toEqual(same)
    expect(later.id).not.toBe(first.id)
    expect(later.text.slice(0, 30)).not.toBe(first.text.slice(0, 30))
    expect([...later.text].sort()).toEqual([...first.text].sort())
    const diagnostic = getAssessmentText(layout, 'diagnostic', weekOne)
    expect(diagnostic).toEqual(getAssessmentText(layout, 'diagnostic', weekTwo))
    expect(diagnostic.text).not.toBe(first.text)
    for (const text of [first.text, diagnostic.text]) {
      expect(text.length).toBeGreaterThan(1_000)
      expect(text).not.toMatch(/[\n\r\t]/)
      for (const glyph of glyphs) expect(text.toLowerCase()).toContain(glyph)
    }
  })
  it.each([
    ['ru', 'а', 'о'],
    ['en', 'a', 'e'],
  ] as const)('rotates four distinct %s openings and calibrates the reached prefix within each form', (layout, slowKey, secondSlowKey) => {
    const monday = Date.UTC(2026, 10, 23)
    const dates = Array.from({ length: 32 }, (_, week) => new Date(monday + week * 604_800_000))
    const texts = dates.map((date) => getAssessmentText(layout, 'benchmark', date).text)
    const costs = [
      (glyph: string) => glyph.toLowerCase() === slowKey ? 1400 : 400,
      (glyph: string) => glyph.toLowerCase() === secondSlowKey ? 1050 : 520,
      (glyph: string) => /[\d.,!?:%]/.test(glyph) || glyph !== glyph.toLowerCase() ? 700 : 220,
    ]
    // Three characters in 45 seconds equal 0.8 WPM for these fixed models.
    expect(new Set(texts).size).toBe(32)
    expect(new Set(texts.slice(0, 4).map((text) => text.split(' ').slice(0, 3).join(' '))).size).toBe(4)
    for (const cost of costs) {
      const counts = texts.map((text) => {
        let elapsed = 0
        let count = 0
        for (const glyph of text) {
          elapsed += cost(glyph)
          if (elapsed > 45_000) break
          count++
        }
        return count
      })
      for (let form = 0; form < 4; form++) {
        const group = counts.filter((_, index) => benchmarkForm(layout, dates[index]) === form)
        expect(Math.max(...group) - Math.min(...group)).toBeLessThanOrEqual(3)
      }
    }
  })

})

describe('confusion-pair drills', () => {
  it('targets known pairs, excluding unknown and wrong-layout keys', () => {
    const known = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';']
    const pairs = [
      { expected: 'A', actual: 's' }, { expected: 'd', actual: 'f' },
      { expected: 'a', actual: 's' }, { expected: 'a', actual: 'a' },
      { expected: 's', actual: 'q' }, { expected: 'a', actual: 'ф' },
    ]
    const drill = generateConfusionDrill('en', ['ф', ...known], pairs, 'short', 23)
    expect(drill?.pairs).toEqual([{ expected: 'a', actual: 's' }, { expected: 'd', actual: 'f' }])
    expect(drill?.keys).toEqual(['a', 's', 'd', 'f'])
    expect(drill?.text).toContain('asa sas dfd fdf')
    expect([...(drill?.text ?? '')].every((glyph) => glyph === ' ' || known.includes(glyph))).toBe(true)
    expect(generateConfusionDrill('en', known, pairs.slice(-2), 'short', 23)).toBeUndefined()
  })
})
