import { buildDrill, lessonTextLengths, lessonsFor, seededRandom } from '@/data/lessons'
import type { Layout, LetterTransition, SessionResult, Settings } from '@/types'
import type { KeyEntry } from './metrics'

export interface TransitionInsight extends LetterTransition {
  samples: number
  medianMs: number
  previousSamples?: number
  previousMedianMs?: number
  previousSource?: 'practice' | 'drill'
  changeMs?: number
}

const MAX_SAMPLES_PER_PAIR = 24
export const TRANSITION_MIN_SAMPLES = 8
const SESSION_WINDOW = 6

function letterInLayout(value: string, layout: Layout): string | undefined {
  const letter = value.toLowerCase()
  return (layout === 'ru' ? /^[а-яё]$/u : /^[a-z]$/).test(letter) ? letter : undefined
}

function transitionId({ from, to }: LetterTransition): string {
  return `${from}->${to}`
}

function parseTransition(id: string, layout: Layout): LetterTransition | undefined {
  const [from, to, extra] = id.split('->')
  return from && to && extra === undefined && letterInLayout(from, layout) === from && letterInLayout(to, layout) === to
    ? { from, to }
    : undefined
}

export function collectTransitions(entries: readonly KeyEntry[], layout: Layout, maxPauseMs: number): Record<string, number[]> {
  const samples: Record<string, number[]> = {}
  let previous: { letter: string; at: number } | undefined
  for (const entry of entries) {
    const letter = letterInLayout(entry.expected, layout)
    if (!letter || !entry.correct || entry.backspace || entry.unattributed || !Number.isFinite(entry.at) ||
        letter !== letterInLayout(entry.actual, layout)) {
      previous = undefined
      continue
    }
    if (previous) {
      const latency = entry.at - previous.at
      if (latency > 0 && latency <= maxPauseMs) {
        const id = transitionId({ from: previous.letter, to: letter })
        const timings = (samples[id] ??= [])
        if (timings.length === MAX_SAMPLES_PER_PAIR) timings.shift()
        timings.push(latency)
      }
    }
    previous = { letter, at: entry.at }
  }
  return samples
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function validSamples(samples: number[] | undefined): number[] {
  return Array.isArray(samples) ? samples.slice(-MAX_SAMPLES_PER_PAIR).filter((value) => Number.isFinite(value) && value > 0) : []
}

function practiceSessions(sessions: readonly SessionResult[], layout: Layout, before: number) {
  const seen = new Set<string>()
  return sessions.filter((session) => session.mode === 'lesson' || session.mode === 'adaptive' || session.mode === 'precision')
    .filter((session) => session.layout === layout && session.transitions && Object.keys(session.transitions).length > 0)
    .map((session) => ({ session, at: Date.parse(session.endedAt) }))
    .filter(({ at }) => Number.isFinite(at) && at <= before)
    .sort((left, right) => right.at - left.at)
    .filter(({ session }) => {
      if (seen.has(session.id)) return false
      seen.add(session.id)
      return true
    })
    .map(({ session }) => session)
}

function measuredPairs(sessions: readonly SessionResult[], layout: Layout): Map<string, TransitionInsight> {
  const collected = new Map<string, { pair: LetterTransition; timings: number[]; sessions: number }>()
  for (const session of sessions) {
    for (const [id, values] of Object.entries(session.transitions ?? {})) {
      const pair = parseTransition(id, layout)
      const timings = validSamples(values)
      if (!pair || timings.length === 0) continue
      const evidence = collected.get(id) ?? { pair, timings: [], sessions: 0 }
      evidence.timings.push(...timings)
      evidence.sessions += 1
      collected.set(id, evidence)
    }
  }
  const measured = new Map<string, TransitionInsight>()
  for (const [id, { pair, timings, sessions }] of collected) {
    if (timings.length >= TRANSITION_MIN_SAMPLES && sessions >= 2) {
      measured.set(id, { ...pair, samples: timings.length, medianMs: Math.round(median(timings)) })
    }
  }
  return measured
}

function withPrevious(current: TransitionInsight, previous: TransitionInsight | undefined, source: 'practice' | 'drill', sameTask = true): TransitionInsight {
  return previous ? {
    ...current,
    previousSamples: previous.samples,
    previousMedianMs: previous.medianMs,
    previousSource: source,
    ...(sameTask ? { changeMs: current.medianMs - previous.medianMs } : {}),
  } : current
}

export function transitionOverview(
  sessions: readonly SessionResult[],
  layout: Layout,
  now = Date.now(),
): { baselineReady: boolean; slow: TransitionInsight[] } {
  const practice = practiceSessions(sessions, layout, now)
  const recent = [...measuredPairs(practice.slice(0, SESSION_WINDOW), layout).values()]
  if (recent.length < 2) return { baselineReady: false, slow: [] }
  const baseline = median(recent.map(({ medianMs }) => medianMs))
  const slowThreshold = Math.max(baseline * 1.25, baseline + 50)
  const earlier = measuredPairs(practice.slice(SESSION_WINDOW, SESSION_WINDOW * 2), layout)
  const slow = recent.filter(({ medianMs }) => medianMs >= slowThreshold)
    .sort((left, right) => right.medianMs - left.medianMs || transitionId(left).localeCompare(transitionId(right)))
    .map((current) => withPrevious(current, earlier.get(transitionId(current)), 'practice'))
  return { baselineReady: true, slow }
}

export function slowTransitions(sessions: readonly SessionResult[], layout: Layout, limit = 4, now = Date.now()): TransitionInsight[] {
  return transitionOverview(sessions, layout, now).slow.slice(0, limit)
}

export function compareTransitionAttempt(
  history: readonly SessionResult[],
  attempt: SessionResult,
  pairs: readonly LetterTransition[] = attempt.transitionPairs ?? [],
): TransitionInsight[] {
  if (attempt.mode !== 'transition') return []
  const startedAt = Date.parse(attempt.startedAt)
  const priorDrills = history.filter((session) => session.mode === 'transition' && session.layout === attempt.layout &&
    session.id !== attempt.id && Date.parse(session.endedAt) <= startedAt)
    .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))
  const priorPractice = measuredPairs(
    practiceSessions(history.filter((session) => session.id !== attempt.id), attempt.layout, startedAt).slice(0, SESSION_WINDOW),
    attempt.layout,
  )
  return pairs.flatMap((pair) => {
    const id = transitionId(pair)
    const samples = validSamples(attempt.transitions?.[id])
    if (!parseTransition(id, attempt.layout) || samples.length < TRANSITION_MIN_SAMPLES) return []
    const current = { ...pair, samples: samples.length, medianMs: Math.round(median(samples)) }
    for (const session of priorDrills) {
      if (!session.transitionPairs?.some((item) => transitionId(item) === id)) continue
      const previous = validSamples(session.transitions?.[id])
      if (previous.length >= TRANSITION_MIN_SAMPLES) {
        return [withPrevious(current, { ...pair, samples: previous.length, medianMs: Math.round(median(previous)) }, 'drill')]
      }
    }
    return [withPrevious(current, priorPractice.get(id), 'practice', false)]
  })
}

export function generateTransitionDrill(
  layout: Layout,
  knownKeys: ReadonlySet<string>,
  pairs: readonly LetterTransition[],
  length: Settings['lessonLength'] = 'normal',
  seed = Date.now(),
): { text: string; keys: string[]; pairs: LetterTransition[] } | undefined {
  const eligible = new Map<string, LetterTransition>()
  for (const pair of pairs) {
    const id = transitionId(pair)
    if (parseTransition(id, layout) && knownKeys.has(pair.from) && knownKeys.has(pair.to)) eligible.set(id, pair)
  }
  const selected = [...eligible.values()].slice(0, 3)
  if (!selected.length) return undefined

  const random = seededRandom(seed)
  const keys = [...new Set(selected.flatMap(({ from, to }) => [from, to]))]
  const vocabulary = [...new Set(lessonsFor(layout).flatMap((lesson) => lesson.words)
    .flatMap((word) => word.toLowerCase().match(/\p{L}+/gu) ?? []))]
    .filter((word) => [...word].every((letter) => knownKeys.has(letter)))
  const groups = selected.map(({ from, to }) => {
    const pair = from + to
    return [pair, ...vocabulary.filter((word) => word !== pair && word.includes(pair))]
  })
  const repeated = Array.from({ length: TRANSITION_MIN_SAMPLES }, (_, index) => groups.map((group) => {
    if (index % 2 === 0 || group.length === 1) return group[0]
    return group[1 + Math.floor(random() * (group.length - 1))]
  })).flat().join(' ')
  const remaining = lessonTextLengths[length] - repeated.length - 1
  const extra = remaining > 0 ? buildDrill(groups.flat(), [], remaining, random) : ''
  return { text: extra ? repeated + ' ' + extra : repeated, keys, pairs: selected }
}
