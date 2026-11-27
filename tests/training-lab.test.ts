import { describe, expect, it } from 'vitest'
import { buildSessionResult } from '../src/lib/metrics'
import {
  decodeTextFile, matchesSwitchCue, splitTransferText, summarizeTransfer, switchCues, switchMeasurement,
} from '../src/lib/trainingLab'

describe('personal text training', () => {
  it('selects disjoint excerpts and normalizes punctuation for a physical keyboard', () => {
    const practice = 'У берега стоит маленькая лодка. Её оставили на песке, чтобы дождаться прилива и вернуться утром.'
    const control = 'В полдень над деревней показалось облако. Ветер гнал его к лесу, но до вечера дождь так и не начался.'
    const source = practice + ' «Время» — важно. ' + control
    const normalized = practice + ' "Время" - важно. ' + control
    const excerpts = splitTransferText(source)
    expect(excerpts?.layout).toBe('ru')
    const first = normalized.indexOf(excerpts!.practice)
    const second = normalized.indexOf(excerpts!.control)
    expect(first).toBe(0)
    expect(second).toBeGreaterThanOrEqual(first + excerpts!.practice.length)
    expect(excerpts!.practice).not.toContain('«')
    expect(excerpts!.control).not.toContain('—')
  })

  it('rejects a short input and an identical repeated excerpt', () => {
    const passage = 'В саду созрели яблоки. Птицы слетелись на старую яблоню и ждали солнечного дня, чтобы остаться в саду.'
    expect(splitTransferText('Одна короткая строка.')).toBeNull()
    expect(splitTransferText(passage + ' ' + passage)).toBeNull()
  })

  it('rejects a near-copy with punctuation or one word changed', () => {
    const passage = 'В саду созрели яблоки. Птицы слетелись на старую яблоню и ждали солнечного дня, чтобы остаться в саду.'
    expect(splitTransferText(passage + ' ' + passage.replace('яблоки.', 'яблоки!'))).toBeNull()
    expect(splitTransferText(passage + ' ' + passage.replace('яблоки', 'груши'))).toBeNull()
  })

  it('classifies the glyphs used in both excerpts and declines a mixed comparison', () => {
    const first = 'Before the library opened, a painter left a cup of black coffee and a stack of sketchbooks by the front door.'
    const next = 'The bus arrived after sunset. A quiet passenger adjusted her coat and waved to a friend across the narrow street.'
    const other = 'В полдень над деревней показалось облако. Ветер гнал его к лесу, но до вечера дождь так и не начался.'
    expect(splitTransferText(first + ' ' + next)?.layout).toBe('en')
    expect(splitTransferText(first + ' ' + other)).toBeNull()
  })

  it('decodes a UTF-8 or Windows-1251 text file locally', () => {
    expect(decodeTextFile(new TextEncoder().encode('Привет, мир!').buffer)).toBe('Привет, мир!')
    expect(decodeTextFile(Uint8Array.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]).buffer)).toBe('Привет')
    expect(() => decodeTextFile(Uint8Array.from([0, 10, 13, 0]).buffer)).toThrow('текст')
  })

  it('keeps first-pass aggregates and drops source text, key details and confusion pairs', () => {
    const startedAt = new Date('2026-11-22T12:00:00Z')
    const privateResult = {
      ...buildSessionResult({
        id: 'practice-attempt', mode: 'transfer-practice', layout: 'ru', level: 0,
        startedAt, endedAt: new Date(startedAt.getTime() + 20_000), correctChars: 80, errors: 1,
        entries: [{ at: startedAt.getTime(), expected: 'а', actual: 'о', correct: false }],
        backspaces: 0, bestStreak: 80,
      }),
      completedText: true, reviewPairs: [{ expected: 'а', actual: 'о' }],
      firstPassAccuracy: 98.8, firstPassErrors: 1, inputText: 'Личные записи',
    }
    const saved = summarizeTransfer(privateResult, 'comparison')
    expect(saved).toMatchObject({
      id: 'practice-attempt', transferRunId: 'comparison', completedText: true, correctChars: 80,
      firstPassAccuracy: 98.8, firstPassErrors: 1, keyStats: {}, confusions: {}, samples: [],
    })
    expect(saved).not.toHaveProperty('inputText')
    expect(saved).not.toHaveProperty('reviewPairs')
  })
})

describe('layout-switch practice', () => {
  it('arms the initial layout and then alternates exactly twelve times', () => {
    const cues = switchCues('ru')
    expect(cues).toHaveLength(13)
    expect(cues.map(({ layout }) => layout)).toEqual(['ru', 'en', 'ru', 'en', 'ru', 'en', 'ru', 'en', 'ru', 'en', 'ru', 'en', 'ru'])
    expect(switchCues('en').slice(0, 2).map(({ layout }) => layout)).toEqual(['en', 'ru'])
    const english = cues[1]
    expect(matchesSwitchCue(english, 'ы', 'KeyS')).toBe(false)
    expect(matchesSwitchCue(english, 's', 'KeyA')).toBe(false)
    expect(matchesSwitchCue(english, 's', 'KeyS')).toBe(true)
    expect(switchMeasurement(english, 1650, 2095, true)).toEqual({ layout: 'en', latencyMs: 445, wrongFirst: true })
  })
})

