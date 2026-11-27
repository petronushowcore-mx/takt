import { describe, expect, it } from 'vitest'
import { diagnoseStroke, hintDelay, initialDiagnosis } from '@/lib/practiceHints'
import type { AppState } from '@/types'

describe('подсказки по навыку', () => {
  it('учитывает завершённые уроки и точность отдельно для каждой раскладки', () => {
    const progress: AppState['lessonProgress'] = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [
      'ru-0' + (i + 1), { attempts: 1, completed: true, bestAccuracy: 96, bestWpm: 26 },
    ]))
    expect(hintDelay('en', progress)).toBe(0)
    expect(hintDelay('ru', progress)).toBe(900)
    for (let i = 1; i <= 4; i++) progress['ru-0' + i].bestAccuracy = 98
    expect(hintDelay('ru', progress)).toBe(1800)
  })
})

describe('диагностика клавиатуры', () => {
  const englishOnRussian = { layout: 'ru', expected: 'ф', code: 'KeyA', key: 'a', capsLock: false, at: 10 } as const

  it('распознаёт серию нажатий в другой раскладке и очищает совет после правильного знака', () => {
    const one = diagnoseStroke(initialDiagnosis, englishOnRussian)
    expect(one.issue).toBeNull()
    const two = diagnoseStroke(one, { ...englishOnRussian, at: 210 })
    expect(two.issue).toBe('layout')
    expect(diagnoseStroke(two, { ...englishOnRussian, at: 310, key: 'ф' }).issue).toBeNull()
  })

  it('оставляет одиночную ошибку, неверную физическую клавишу и слишком давнюю попытку без совета', () => {
    const one = diagnoseStroke(initialDiagnosis, englishOnRussian)
    expect(diagnoseStroke(one, { ...englishOnRussian, code: 'KeyS', at: 210 }).issue).toBeNull()
    expect(diagnoseStroke(one, { ...englishOnRussian, at: 2000 }).issue).toBeNull()
  })

  it('различает Caps Lock и кириллицу в английской раскладке', () => {
    const english = { layout: 'en', expected: 'a', code: 'KeyA', key: 'A', capsLock: true, at: 10 } as const
    expect(diagnoseStroke(initialDiagnosis, english).issue).toBe('caps-lock')
    expect(diagnoseStroke(initialDiagnosis, { ...english, capsLock: false }).issue).toBeNull()
    const russianOnEnglish = { ...english, key: 'ф', capsLock: false }
    const one = diagnoseStroke(initialDiagnosis, russianOnEnglish)
    expect(diagnoseStroke(one, { ...russianOnEnglish, at: 100 }).issue).toBe('layout')
  })
})
