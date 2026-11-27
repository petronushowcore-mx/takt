import type { SessionResult } from '@/types'
import { linearSlope, mergeKeyStats } from '@/lib/metrics'

export const TREND_MIN_DAYS = 3
export const TREND_MIN_ACTIVE_SECONDS = 10
export const TREND_MIN_CORRECT_CHARS = 20
const DAY_MS = 86_400_000

export function isPaceSample(session: Pick<SessionResult, 'activeMs' | 'correctChars' | 'wpm'>): boolean {
  return session.activeMs >= TREND_MIN_ACTIVE_SECONDS * 1000
    && session.correctChars >= TREND_MIN_CORRECT_CHARS
    && Number.isFinite(session.wpm)
}

function timestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  return typeof value === 'string' ? Date.parse(value) : NaN
}

export function observedSessions(sessions: SessionResult[], now = Date.now()): SessionResult[] {
  return sessions.filter(({ endedAt }) => {
    const time = timestamp(endedAt)
    return Number.isFinite(time) && time <= now
  })
}

export function dateKey(value: unknown): string {
  const time = timestamp(value)
  if (!Number.isFinite(time)) return ''
  const date = new Date(time)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function aggregate(sessions: SessionResult[]) {
  const correct = sessions.reduce((sum, session) => sum + session.correctChars, 0)
  const errors = sessions.reduce((sum, session) => sum + session.errors, 0)
  const keys = sessions.reduce((sum, session) => sum + session.totalKeys, 0)
  const activeMs = sessions.reduce((sum, session) => sum + session.activeMs, 0)
  const minutes = activeMs / 60000
  return {
    sessions: sessions.length,
    correct,
    errors,
    activeMs,
    wpm: minutes > 0 ? Math.round((correct / 5 / minutes) * 10) / 10 : 0,
    cpm: minutes > 0 ? Math.round((correct / minutes) * 10) / 10 : 0,
    accuracy: keys ? Math.round((Math.max(0, keys - errors) / keys) * 1000) / 10 : 0,
    bestStreak: sessions.reduce((best, session) => Math.max(best, session.bestStreak), 0),
  }
}

export function dailySeries(sessions: SessionResult[], days = 30) {
  const grouped = new Map<string, { date: Date; sessions: SessionResult[] }>()
  for (const session of observedSessions(sessions)) {
    const date = new Date(session.endedAt)
    const key = dateKey(date)
    const bucket = grouped.get(key)
    if (bucket) bucket.sessions.push(session)
    else grouped.set(key, { date, sessions: [session] })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dates = days === 0
    ? [...grouped.values()].map(({ date }) => date).sort((left, right) => left.getTime() - right.getTime())
    : Array.from({ length: days }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - days + index + 1)
      return date
    })

  return dates.map((date) => {
    const key = dateKey(date)
    const values = grouped.get(key)?.sessions ?? []
    const summary = aggregate(values)
    return {
      date: key,
      label: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: days === 0 ? 'numeric' : undefined }),
      wpm: summary.activeMs > 0 ? summary.wpm : null,
      accuracy: values.some((session) => session.totalKeys > 0) ? summary.accuracy : null,
      minutes: Math.round(summary.activeMs / 6000) / 10,
      sessions: values.length,
    }
  })
}

export function speedTrend(sessions: SessionResult[], recentCount = 0) {
  const days = new Map<number, { totalWpm: number; count: number }>()
  for (const session of observedSessions(sessions)) {
    if (!isPaceSample(session)) continue
    const day = Date.parse(dateKey(session.endedAt)) / DAY_MS
    if (!Number.isFinite(day)) continue
    const sample = days.get(day) ?? { totalWpm: 0, count: 0 }
    sample.totalWpm += session.wpm
    sample.count += 1
    days.set(day, sample)
  }
  const ordered = [...days].sort(([left], [right]) => left - right)
  const selected = recentCount > 0 ? ordered.slice(-recentCount) : ordered
  const samples = selected.length
  const ready = samples >= TREND_MIN_DAYS
  const slope = ready ? linearSlope(selected.map(([day, sample]) => ({
    x: day - selected[0][0],
    y: sample.totalWpm / sample.count,
  }))) : 0
  return {
    wpmPerWeek: Math.round(slope * 7 * 10) / 10,
    confidence: (samples >= 10 ? 'high' : samples >= 5 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
    samples,
    ready,
  }
}

export function weakKeys(sessions: SessionResult[], limit = 6) {
  return Object.entries(mergeKeyStats(sessions))
    .filter(([, stat]) => stat.attempts >= 3 && stat.errors > 0)
    .map(([key, stat]) => ({
      key,
      attempts: stat.attempts,
      errorRate: stat.attempts ? Math.round((stat.errors / stat.attempts) * 1000) / 10 : 0,
      latencyMs: stat.latencyMs,
      score: (stat.errors / stat.attempts) * 100 + stat.latencyMs / 500,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function practiceDayStreak(sessions: SessionResult[]): number {
  const days = new Set(observedSessions(sessions).map((session) => dateKey(session.endedAt)))
  let streak = 0
  const cursor = new Date()
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (days.has(dateKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function periodDelta(sessions: SessionResult[], days = 7) {
  const now = Date.now()
  const windowMs = days * DAY_MS
  const current: SessionResult[] = []
  const previous: SessionResult[] = []
  for (const session of sessions) {
    const age = now - timestamp(session.endedAt)
    if (age >= 0 && age <= windowMs) current.push(session)
    if (age > windowMs && age <= windowMs * 2) previous.push(session)
  }
  const a = aggregate(current)
  const b = aggregate(previous)
  return {
    current: a,
    previous: b,
    wpm: Math.round((a.wpm - b.wpm) * 10) / 10,
    accuracy: Math.round((a.accuracy - b.accuracy) * 10) / 10,
    minutes: Math.round((a.activeMs - b.activeMs) / 6000) / 10,
  }
}

export function weeklySpeedComparison(
  sessions: SessionResult[],
  t?: (message: string, values?: Record<string, string | number>) => string,
): string {
  const { current, previous, wpm } = periodDelta(sessions)
  const insufficient = 'Для недельного сравнения нужна практика в обоих периодах'
  if (!current.activeMs || !previous.activeMs) return t?.(insufficient) ?? insufficient
  const signedWpm = wpm > 0 ? '+' + wpm : String(wpm)
  const message = '{wpm} сл/мин · последние 7 дней к предыдущим 7'
  return t?.(message, { wpm: signedWpm }) ?? message.replace('{wpm}', signedWpm)
}
