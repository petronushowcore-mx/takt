import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const exec = promisify(execFile)
let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'klavish-analysis-')) })
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

function recordedSession(day: number, wpm: number, overrides: Record<string, unknown> = {}) {
  const date = new Date(2024, 0, day, 12)
  return {
    schemaVersion: 1, id: `session-${day}-${wpm}`, startedAt: new Date(date.getTime() - 60000).toISOString(),
    endedAt: date.toISOString(), mode: 'lesson', layout: 'ru', activeMs: 60000, wallMs: 60000,
    wpm, correctChars: wpm * 5, totalKeys: wpm * 5, errors: 0, bestStreak: wpm * 5, ...overrides,
  }
}

async function analyzeExport(sessions: ReturnType<typeof recordedSession>[]) {
  const source = path.join(root, 'export.json')
  const out = path.join(root, 'out')
  await fs.writeFile(source, JSON.stringify({ state: { sessions } }), 'utf8')
  await exec(process.execPath, [path.resolve('tools/analyze-progress.mjs'), source, '--out', out])
  return JSON.parse(await fs.readFile(path.join(out, 'progress-report.json'), 'utf8'))
}

describe('внешний анализатор журналов', () => {
  it('сохраняет точность нажатий после Backspace без завышения скорости', async () => {
    const data = {
      schemaVersion: 1,
      id: 'corrected',
      startedAt: '2026-11-01T09:59:59.000Z',
      endedAt: '2026-11-01T10:00:00.000Z',
      mode: 'lesson',
      layout: 'ru',
      activeMs: 1000,
      wallMs: 1000,
      correctChars: 2,
      totalKeys: 4,
      errors: 1,
      backspaces: 1,
      bestStreak: 1,
      wpm: 24,
      accuracy: 75,
      keyStats: {},
      confusions: {},
      samples: [],
    }
    const event = { schema: 'klavish.event.v1', type: 'session_completed', recordedAt: data.endedAt, appVersion: '0.1.0', data }
    await fs.writeFile(path.join(root, 'sessions-2026-11-01.jsonl'), JSON.stringify(event) + '\n', 'utf8')
    const out = path.join(root, 'out')
    await exec(process.execPath, [path.resolve('tools/analyze-progress.mjs'), root, '--out', out])
    const report = JSON.parse(await fs.readFile(path.join(out, 'progress-report.json'), 'utf8'))
    expect(report.summary).toMatchObject({ correctChars: 2, wpm: null, accuracy: 75 })
    expect(report.byMode).toMatchObject([{ mode: 'lesson', wpm: 24, accuracy: 75 }])
  })

  it('читает JSONL, пропускает повреждённые строки и строит динамику', async () => {
    const logs = path.join(root, 'logs')
    await fs.mkdir(logs)
    const sessions = Array.from({ length: 6 }, (_, index) => ({
      schemaVersion: 1,
      id: `s${index}`,
      startedAt: `2026-11-${String(index + 1).padStart(2, '0')}T09:59:00.000Z`,
      endedAt: `2026-11-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
      mode: 'lesson', layout: 'ru', level: 1,
      activeMs: 60000, wallMs: 60000, totalKeys: 100 + index * 10, correctChars: 100 + index * 10,
      errors: 0, backspaces: 0, bestStreak: 100,
      cpm: 100 + index * 10, wpm: 20 + index * 2,
      accuracy: 100, meanLatencyMs: 300, p95LatencyMs: 600, score: 1000,
      keyStats: { ф: { attempts: 10, errors: index % 2, latencyMs: 3000, latencySamples: 10 } },
      confusions: { 'ф->а': index % 2 }, samples: [],
    }))
    const lines = sessions.map((data) => JSON.stringify({ schema: 'klavish.event.v1', type: 'session_completed', recordedAt: data.endedAt, appVersion: '0.1.0', data })).join('\n')
    const invalidStamp = JSON.stringify({ ...sessions[0], endedAt: 'undated' })
    await fs.writeFile(path.join(logs, 'sessions-2026-11-01.jsonl'), `${lines}\n${invalidStamp}\n{broken\n`, 'utf8')
    const out = path.join(root, 'out')
    await exec(process.execPath, [path.resolve('tools/analyze-progress.mjs'), logs, '--out', out])
    const report = JSON.parse(await fs.readFile(path.join(out, 'progress-report.json'), 'utf8'))
    expect(report.summary.sessions).toBe(6)
    expect(report.summary.wpm).toBe(25)
    expect(report.source.ignoredLines).toBe(2)
    expect(report.trend.overall.wpmPerWeek).toBe(14)
    expect(report.trend.acceleration).toBeTruthy()
    expect(report.weekly.length).toBeGreaterThan(0)
    expect(report.weakKeys[0].key).toBe('ф')
    const markdown = await fs.readFile(path.join(out, 'progress-report.md'), 'utf8')
    expect(markdown).toContain('Картина обучения'.toLocaleLowerCase())
  })

  it('prints English Markdown and terminal text without changing the JSON report', async () => {
    const report = await analyzeExport([recordedSession(1, 24)])
    const source = path.join(root, 'export.json')
    const out = path.join(root, 'english')
    const { stdout } = await exec(process.execPath, [path.resolve('tools/analyze-progress.mjs'), source, '--out', out, '--lang', 'en'])
    const markdown = await fs.readFile(path.join(out, 'progress-report.md'), 'utf8')
    const englishReport = JSON.parse(await fs.readFile(path.join(out, 'progress-report.json'), 'utf8'))

    expect(stdout).toContain('Reports saved')
    expect(markdown).toContain('# takt.. — typing progress')
    expect(markdown).toContain('Keep the current routine')
    expect(markdown).not.toMatch(/[А-Яа-яЁё]/)
    expect(englishReport).toEqual({ ...report, generatedAt: englishReport.generatedAt })
  })

  it('исключает недостоверные даты и не смешивает тренд практики с замерами', async () => {
    const report = await analyzeExport([
      recordedSession(1, 20),
      recordedSession(2, 40, { mode: 'benchmark', layout: 'en' }),
      recordedSession(3, 60, { mode: 'benchmark', layout: 'en' }),
      recordedSession(4, 50, { mode: 'diagnostic', layout: 'en' }),
      recordedSession(5, 80, { endedAt: 'undated' }),
      recordedSession(6, 90, { endedAt: undefined }),
      recordedSession(7, 100, { endedAt: new Date(Date.now() + 86_400_000).toISOString() }),
    ])
    expect(report.source.ignoredLines).toBe(3)
    expect(report.daily.map(({ date }: { date: string }) => date)).toEqual(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'])
    expect(report.summary.sessions).toBe(4)
    expect(report.trend).toMatchObject({
      population: 'completed-lessons-all-layouts', overall: { samples: 1, ready: false }, acceleration: null,
    })
    expect(report.weekly).toMatchObject([{ date: '2024-01-01', sessions: 1, wpmChange: null }])
    expect(report.forecast).toMatchObject({ targetWpm: 30, estimatedWeeks: null })
  })

  it('считает наклон по календарным датам и отдельно проверяет оба минимума', async () => {
    const report = await analyzeExport([
      recordedSession(1, 20, { activeMs: 12000, correctChars: 20 }),
      recordedSession(3, 30, { activeMs: 10000, correctChars: 25 }),
      recordedSession(8, 34),
      recordedSession(9, 120, { activeMs: 9999, correctChars: 20 }),
      recordedSession(10, 120, { activeMs: 10000, correctChars: 19 }),
    ])
    expect(report.trend.overall).toEqual({ samples: 3, ready: true, wpmPerWeek: 12.4 })
  })

  it('отличает соседние недели с одинаковым темпом от первого замера и пропуска', async () => {
    const report = await analyzeExport([
      recordedSession(2, 20),
      recordedSession(9, 20),
      recordedSession(30, 40),
      recordedSession(37, 50),
    ])
    expect(report.weekly.map(({ wpmChange }: { wpmChange: number | null }) => wpmChange)).toEqual([null, 0, null, 10])
  })

  it('сравнивает темп уроков и сохраняет другие упражнения в активности', async () => {
    const report = await analyzeExport([
      recordedSession(1, 40, { completedText: true }),
      recordedSession(8, 40, { completedText: true }),
      recordedSession(15, 40),
      recordedSession(8, 20, { mode: 'precision' }),
      recordedSession(15, 20, { mode: 'review' }),
      recordedSession(15, 60, { mode: 'orbit' }),
      recordedSession(15, 90, { completedText: false }),
      recordedSession(16, 70, { mode: 'hardcore', keyStats: { щ: { attempts: 30, errors: 20, latencyMs: 3000, latencySamples: 10 } } }),
      recordedSession(17, 0, { mode: 'layout-switch', activeMs: 3600, correctChars: 12, totalKeys: 15, errors: 3 }),
      recordedSession(18, 50, { mode: 'diagnostic' }),
      recordedSession(19, 50, { mode: 'benchmark' }),
      recordedSession(20, 50, { mode: 'transfer-control' }),
    ])
    expect(report.summary).toMatchObject({ sessions: 12, wpm: 40 })
    expect(report.trend.overall).toMatchObject({ ready: true, samples: 3, wpmPerWeek: 0 })
    expect(report.weekly.map(({ wpm }: { wpm: number | null }) => wpm)).toEqual([40, 40, 40])
    expect(report.activity).toMatchObject({ sessions: 9, activeMs: 483600, days: 5 })
    expect(report.weakKeys).toEqual([])
    expect(report.byMode).toEqual(expect.arrayContaining([
      expect.objectContaining({ mode: 'layout-switch', wpm: null, cpm: null, activeMs: 3600 }),
      expect.objectContaining({ mode: 'hardcore', pacePopulation: 'targeted-drill', wpm: 70 }),
    ]))
  })

  it('не превращает время переключения раскладки в скорость набора', async () => {
    const report = await analyzeExport([
      recordedSession(1, 0, { mode: 'layout-switch', activeMs: 3600, correctChars: 12, totalKeys: 15, errors: 3 }),
    ])
    expect(report.summary).toMatchObject({ sessions: 1, wpm: null, cpm: null })
    expect(report.daily[0]).toMatchObject({ wpm: null, cpm: null })
    expect(report.activity).toMatchObject({ sessions: 1, activeMs: 3600, days: 1 })
    expect(report.forecast).toBeNull()
  })

  it('использует оценочную часть урока для темпа и сохраняет время разминки в активности', async () => {
    const report = await analyzeExport([
      recordedSession(1, 30, {
        completedText: true, activeMs: 120000, correctChars: 600, totalKeys: 610, errors: 10,
        lessonScored: { activeMs: 60000, correctChars: 150, totalKeys: 155, errors: 5 },
      }),
      recordedSession(8, 22.8, {
        completedText: true, lessonScored: { activeMs: 10000, correctChars: 19, totalKeys: 21, errors: 2 },
      }),
    ])
    expect(report.summary).toMatchObject({ sessions: 2, wpm: 30 })
    expect(report.lessonPace).toMatchObject({ sessions: 1, accuracy: 96.8, activeMs: 60000 })
    expect(report.trend.overall).toMatchObject({ samples: 1, ready: false })
    expect(report.activity).toMatchObject({ sessions: 2, activeMs: 180000 })
    expect(report.byMode).toMatchObject([{ mode: 'lesson', accuracy: 96, activeMs: 180000 }])
  })
})
