import { expect, it } from 'vitest'
import { buildSessionResult } from '@/lib/metrics'

it('различает ошибку регистра, перепутанную клавишу и нажатие без цели', () => {
  const result = buildSessionResult({
    id: 'key-evidence',
    startedAt: new Date(0),
    endedAt: new Date(300),
    entries: [
      { at: 0, expected: '', actual: 'ъ', correct: false, unattributed: true },
      { at: 100, expected: 'П', actual: 'п', correct: false },
      { at: 200, expected: 'П', actual: 'П', correct: true },
      { at: 300, expected: 'ы', actual: 'а', correct: false },
    ],
    correctChars: 1,
    errors: 3,
    backspaces: 0,
    bestStreak: 1,
    mode: 'lesson',
    layout: 'ru',
    level: 11,
  })

  expect(result).toMatchObject({ totalKeys: 4, errors: 3, activeMs: 300, accuracy: 25 })
  expect(result.confusions).toEqual({ 'ы->а': 1 })
  expect(Object.keys(result.keyStats).sort()).toEqual(['shift', 'п', 'ы'])
  expect(result.keyStats.shift).toMatchObject({ attempts: 2, errors: 1 })
  expect(result.keyStats['п']).toMatchObject({ attempts: 1, errors: 0 })
})
