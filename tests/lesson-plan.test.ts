import { describe, expect, it } from 'vitest'
import { generateAdaptiveText, generateLessonText, lessonDifficulty, lessonsFor, nextLessonDifficulty } from '../src/data/lessons'
import { buildSessionResult } from '../src/lib/metrics'
import type { AppState, LessonProgress, SessionResult } from '../src/types'

const layoutAlphabets = [
  ['ru', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'],
  ['en', 'abcdefghijklmnopqrstuvwxyz'],
] as const

describe('typing curriculum', () => {
  it.each(layoutAlphabets)('covers the %s alphabet in order and exercises every introduced key', (layout, alphabet) => {
    const known = new Set([' '])
    const course = lessonsFor(layout)
    expect(course).toHaveLength(12)

    course.forEach((lesson, index) => {
      expect(lesson.id).toBe(`${layout}-${String(index + 1).padStart(2, '0')}`)
      const assignedKeys = lesson.keys.split(' ')
      assignedKeys.forEach((key) => known.add(key))
      for (const text of [...lesson.words, ...(lesson.patterns ?? [])]) {
        expect([...text.toLowerCase()].filter((character) => !known.has(character))).toEqual([])
        if (text !== text.toLowerCase()) expect(known.has('shift')).toBe(true)
      }

      for (const length of ['short', 'normal', 'long'] as const) {
        for (const seed of [0, 1, 2, 17]) {
          const text = generateLessonText(lesson, length, seed)
          for (const key of assignedKeys) {
            if (key === 'shift') expect(text).not.toBe(text.toLowerCase())
            else expect(text.toLowerCase()).toContain(key)
          }
        }
      }
    })

    for (const letter of alphabet) expect(known.has(letter)).toBe(true)
  })

  it('uses sparse focus material and omits unsupported focus keys', () => {
    const key = { attempts: 20, errors: 20, latencyMs: 6000, latencySamples: 20 }
    const session = makeResult({ layout: 'en', keyStats: { ';': key, '^': key } })
    const adaptive = generateAdaptiveText('en', [session], 'short')
    expect(adaptive.keys).toEqual([';'])
    expect(adaptive.text).toContain(';')
    expect(generateAdaptiveText('ru', [session], 'short').keys).toEqual([])
  })

  it('limits adaptive drills to the current level and ignores assessments', () => {
    const key = { attempts: 20, errors: 20, latencyMs: 6000, latencySamples: 20 }
    const practice = makeResult({ layout: 'en', wpm: 60, keyStats: { a: key, z: key } })
    const diagnosis = makeResult({ layout: 'en', mode: 'diagnostic', wpm: 90, keyStats: { ';': key } })
    const assessment = makeResult({ layout: 'en', mode: 'benchmark', wpm: 90, keyStats: { f: key } })
    const adaptive = generateAdaptiveText('en', [practice, diagnosis, assessment], 'short', 1)
    expect(adaptive.keys).toEqual(['a'])
    expect([...adaptive.text].every((glyph) => 'asdfjkl; '.includes(glyph))).toBe(true)
    expect(generateAdaptiveText('en', [diagnosis, assessment], 'short', 1).difficulty).toBe('мягкий старт')
  })
})

const [firstLesson, secondLesson] = lessonsFor('ru')
const passed: LessonProgress = { attempts: 1, completed: true, bestWpm: 99, bestAccuracy: 100 }
const profile: AppState = {
  version: 1,
  profileId: 'curriculum-test',
  createdAt: '2026-01-01T00:00:00.000Z',
  sessions: [],
  lessonProgress: { [firstLesson.id]: passed },
  achievements: {},
  settings: { layout: 'ru', sound: false, showKeyboard: true, lessonLength: 'normal' },
}

function makeResult(fields: Partial<SessionResult>): SessionResult {
  const started = new Date(profile.createdAt)
  return {
    ...buildSessionResult({
      id: 'curriculum-session', startedAt: started, endedAt: started, entries: [],
      mode: 'lesson', layout: 'ru', lessonId: firstLesson.id, level: 1,
      correctChars: 0, errors: 0, backspaces: 0, bestStreak: 0,
    }),
    ...fields,
  }
}

describe('personalized next lesson', () => {
  it.each([
    { wpm: 16, accuracy: 94, increasePercent: 5, targetWpm: 16.8 },
    { wpm: 16.7, accuracy: 97, increasePercent: 5, targetWpm: 16.8 },
    { wpm: 16.8, accuracy: 96.9, increasePercent: 5, targetWpm: 16.8 },
    { wpm: 16.8, accuracy: 97, increasePercent: 10, targetWpm: 17.6 },
    { wpm: 17.5, accuracy: 99, increasePercent: 10, targetWpm: 17.6 },
    { wpm: 17.6, accuracy: 98.9, increasePercent: 10, targetWpm: 17.6 },
    { wpm: 17.6, accuracy: 99, increasePercent: 15, targetWpm: 18.4 },
  ])('issues +$increasePercent% at $wpm WPM and $accuracy% accuracy', ({ wpm, accuracy, increasePercent, targetWpm }) => {
    expect(nextLessonDifficulty(firstLesson, 16, { wpm, accuracy }, true))
      .toMatchObject({ lesson: { id: secondLesson.id }, targetWpm, increasePercent })
  })

  it('requires the whole text, minimum accuracy, and the issued pace', () => {
    expect(nextLessonDifficulty(firstLesson, 16, { wpm: 40, accuracy: 100 }, false)).toBeUndefined()
    expect(nextLessonDifficulty(firstLesson, 16, { wpm: 15.9, accuracy: 100 }, true)).toBeUndefined()
    expect(nextLessonDifficulty(firstLesson, 16, { wpm: 40, accuracy: 93.9 }, true)).toBeUndefined()
    expect(nextLessonDifficulty(secondLesson, 16.8, { wpm: 16.8, accuracy: 94 }, true)?.targetWpm).toBe(17.7)
    expect(nextLessonDifficulty(secondLesson, 16.8, { wpm: 30, accuracy: 100 }, true)?.targetWpm).toBe(19.3)
  })

  it('keeps an issued target and step, and reconstructs only unassigned legacy targets', () => {
    const partial = makeResult({ wpm: 99, accuracy: 100, completedText: false })
    const full = makeResult({ wpm: 19, accuracy: 99, completedText: true, targetWpm: 17 })
    expect(lessonDifficulty(secondLesson, { ...profile, sessions: [partial] }))
      .toEqual({ targetWpm: 16.8, increasePercent: 5 })
    expect(lessonDifficulty(secondLesson, { ...profile, sessions: [full, partial] }))
      .toEqual({ targetWpm: 19.5, increasePercent: 15 })
    expect(lessonDifficulty(secondLesson, {
      ...profile, sessions: [full],
      lessonProgress: { ...profile.lessonProgress, [secondLesson.id]: { ...passed, targetWpm: 17.8, increasePercent: 10 } },
    })).toEqual({ targetWpm: 17.8, increasePercent: 10 })
    expect(lessonDifficulty(lessonsFor('en')[0], profile)).toEqual({ targetWpm: 18 })
  })
})
