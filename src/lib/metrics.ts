import type { KeyMetric, SessionResult, SessionSample, SymbolMetric } from '@/types'

export const PAUSE_THRESHOLD_MS = 3000

export interface KeyEntry {
  at: number
  expected: string
  actual: string
  correct: boolean
  backspace?: boolean
  unattributed?: boolean
  position?: number
}

export function normalizeKey(key: string): string {
  if (key === ' ') return 'space'
  return key.toLocaleLowerCase()
}

export function displayKey(key: string): string {
  if (key === 'space') return 'пробел'
  return key === 'shift' ? 'Shift' : key
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

export function calculateActiveMs(entries: KeyEntry[], pauseThreshold = PAUSE_THRESHOLD_MS): number {
  let active = 0
  for (let i = 1; i < entries.length; i += 1) {
    const delta = entries[i].at - entries[i - 1].at
    if (delta > 0 && delta <= pauseThreshold) active += delta
  }
  return active
}

export function charsPerMinute(chars: number, activeMs: number): number {
  return activeMs > 0 ? chars * 60000 / activeMs : 0
}

export function scoreLesson(entries: readonly KeyEntry[], cursor: number, from: number) {
  const printable = entries.filter((entry) => !entry.backspace && (entry.position ?? -1) >= from)
  return {
    correctChars: Math.max(0, cursor - from),
    activeMs: calculateActiveMs(printable),
    totalKeys: printable.length,
    errors: printable.filter((entry) => !entry.correct).length,
  }
}

export function linearSlope(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0)
  if (denominator === 0) return 0
  return points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator
}

export function buildSessionResult(input: {
  id: string
  startedAt: Date
  endedAt: Date
  entries: KeyEntry[]
  correctChars: number
  errors: number
  backspaces: number
  bestStreak: number
  mode: SessionResult['mode']
  layout: SessionResult['layout']
  level: number
  lessonId?: string
  lessonTitle?: string
  score?: number
  samples?: SessionSample[]
  paceWindowMs?: number
}): SessionResult {
  const printable = input.entries.filter((entry) => !entry.backspace)
  const activeMs = calculateActiveMs(printable)
  const wallMs = Math.max(0, input.endedAt.getTime() - input.startedAt.getTime())
  const correct = Math.max(0, input.correctChars)
  const cpm = charsPerMinute(correct, input.paceWindowMs ?? activeMs)
  const errors = Math.max(0, input.errors)
  const totalKeys = printable.length
  const keyStats: Record<string, KeyMetric> = {}
  const symbolStats: Record<string, SymbolMetric> = {}
  const confusions: Record<string, number> = {}
  const latencies: number[] = []

  printable.forEach((entry, index) => {
    const previous = printable[index - 1]
    const latency = previous ? entry.at - previous.at : 0
    const activeInterval = latency > 0 && latency <= PAUSE_THRESHOLD_MS
    if (activeInterval) latencies.push(latency)
    if (entry.unattributed) return

    const symbol = entry.expected === ' ' ? 'space' : entry.expected
    const typed = entry.actual === ' ' ? 'space' : entry.actual
    if (symbol === 'space' || [...symbol].length === 1) {
      const stat = symbolStats[symbol] ??= { attempts: 0, errors: 0, misses: {} }
      stat.attempts += 1
      if (!entry.correct) {
        stat.errors += 1
        if (typed === 'space' || [...typed].length === 1) stat.misses[typed] = (stat.misses[typed] ?? 0) + 1
      }
    }
    const expected = normalizeKey(entry.expected)
    const actual = normalizeKey(entry.actual)
    const caseMiss = !entry.correct && expected === actual && entry.expected !== entry.actual && /^\p{L}$/u.test(entry.expected)
    const typedCapital = entry.correct && /^\p{Lu}$/u.test(entry.expected)
    const keys = caseMiss ? ['shift'] : typedCapital ? [expected, 'shift'] : [expected]
    for (const key of keys) {
      const stat = keyStats[key] ??= { attempts: 0, errors: 0, latencyMs: 0, latencySamples: 0 }
      stat.attempts += 1
      stat.errors += entry.correct ? 0 : 1
      if (activeInterval) {
        stat.latencyMs += latency
        stat.latencySamples += 1
      }
    }
    if (!entry.correct && expected !== actual) {
      const pair = `${expected}->${actual}`
      confusions[pair] = (confusions[pair] || 0) + 1
    }
  })

  return {
    schemaVersion: 1,
    id: input.id,
    startedAt: input.startedAt.toISOString(),
    endedAt: input.endedAt.toISOString(),
    mode: input.mode,
    layout: input.layout,
    lessonId: input.lessonId,
    lessonTitle: input.lessonTitle,
    level: input.level,
    activeMs,
    wallMs,
    totalKeys,
    correctChars: correct,
    errors,
    backspaces: input.backspaces,
    bestStreak: input.bestStreak,
    cpm: Math.round(cpm * 10) / 10,
    wpm: Math.round(cpm * 2) / 10,
    accuracy: totalKeys ? Math.round((printable.filter((entry) => entry.correct).length / totalKeys) * 1000) / 10 : 100,
    meanLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    p95LatencyMs: Math.round(percentile(latencies, 95)),
    score: input.score ?? Math.max(0, Math.round(correct * 10 - errors * 15)),
    keyStats,
    symbolStats,
    confusions,
    samples: input.samples ?? [],
  }
}

export function mergeKeyStats(sessions: SessionResult[]): Record<string, KeyMetric> {
  const merged: Record<string, KeyMetric> = {}
  sessions.forEach((session) => {
    Object.entries(session.keyStats || {}).forEach(([key, stat]) => {
      if (!merged[key]) merged[key] = { attempts: 0, errors: 0, latencyMs: 0, latencySamples: 0 }
      merged[key].attempts += stat.attempts
      merged[key].errors += stat.errors
      merged[key].latencyMs += stat.latencyMs
      merged[key].latencySamples += stat.latencySamples ?? Math.max(0, stat.attempts - stat.errors)
    })
  })
  Object.values(merged).forEach((stat) => {
    if (stat.latencySamples > 0) stat.latencyMs = Math.round(stat.latencyMs / stat.latencySamples)
  })
  return merged
}
