import { glyphRows } from './keyboardLayout'
import { seededRandom } from '@/data/lessons'
import { percentile } from './metrics'
import type { AppState, Layout, SessionMode, SessionResult, SymbolMetric } from '@/types'

const windowMs = 30 * 86_400_000
const comparisonMinimum = 10
const ordinary = new Set<SessionMode>(['lesson', 'adaptive', 'precision'])
const measuredModes = new Set<SessionMode>([...ordinary, 'transfer-practice', 'transfer-control',
  'benchmark', 'diagnostic', 'review', 'transition', 'orbit', 'sprint', 'hardcore'])

type Counts = Pick<SymbolMetric, 'attempts' | 'errors'>
type KeyboardEvidence = Map<string, SymbolMetric>
type ModeTotals = {
  sessions: number; activeMs: number; totalKeys: number; correctChars: number; errors: number
  paceMs: number; paceChars: number
}

function totals(): SymbolMetric {
  return { attempts: 0, errors: 0, misses: {} }
}

function add(evidence: KeyboardEvidence, glyph: string, entry: Counts, misses: Record<string, number> = {}) {
  if (!Number.isSafeInteger(entry?.attempts) || !Number.isSafeInteger(entry?.errors) || entry.attempts < 1 ||
      entry.errors < 0 || entry.errors > entry.attempts) return
  const cell = evidence.get(glyph) ?? totals()
  cell.attempts += entry.attempts
  cell.errors += entry.errors
  for (const [typed, count] of Object.entries(misses)) {
    if ((typed === 'space' || [...typed].length === 1) && Number.isSafeInteger(count) && count > 0 && count <= entry.errors) {
      cell.misses[typed] = (cell.misses[typed] ?? 0) + count
    }
  }
  evidence.set(glyph, cell)
}

export function keyboardGlyphs(layout: Layout): string[] {
  return [...new Set(glyphRows[layout].flatMap(([normal, shifted]) => [...normal, ...shifted])), 'space']
}

function glyphAccuracy(stat: Counts | undefined): number | null {
  return stat?.attempts ? Math.round(1000 * stat.errors / stat.attempts) / 10 : null
}

function describe(stat: SymbolMetric | undefined) {
  return {
    attempts: stat?.attempts ?? 0,
    correct: stat ? stat.attempts - stat.errors : 0,
    errors: stat?.errors ?? 0,
    errorPercent: glyphAccuracy(stat),
    misses: Object.entries(stat?.misses ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  }
}

function errorChange(latest: Counts, prior: Counts): number | null {
  return latest.attempts >= comparisonMinimum && prior.attempts >= comparisonMinimum
    ? Math.round(1000 * (latest.errors / latest.attempts - prior.errors / prior.attempts)) / 10
    : null
}

export function keyboardProgress(history: readonly SessionResult[], layout: Layout, now = new Date()) {
  const glyphs = keyboardGlyphs(layout)
  const active = new Set(glyphs)
  const exact: KeyboardEvidence = new Map()
  const legacy: KeyboardEvidence = new Map()
  const current: KeyboardEvidence = new Map()
  const previous: KeyboardEvidence = new Map()
  const drill: KeyboardEvidence = new Map()
  const previousDrill: KeyboardEvidence = new Map()
  const modes = new Map<SessionMode, ModeTotals>()
  for (const session of history) {
    if (session.layout !== layout) continue
    const age = now.getTime() - Date.parse(session.endedAt)
    if (!Number.isFinite(age) || age < 0) continue
    if (age < windowMs) {
      const values = modes.get(session.mode) ?? {
        sessions: 0, activeMs: 0, totalKeys: 0, correctChars: 0, errors: 0, paceMs: 0, paceChars: 0,
      }
      values.sessions += 1
      values.activeMs += session.activeMs
      values.totalKeys += session.totalKeys
      values.correctChars += session.correctChars
      values.errors += session.errors
      if (session.mode !== 'layout-switch') {
        values.paceChars += session.lessonScored?.correctChars ?? session.correctChars
        values.paceMs += session.lessonScored?.activeMs ??
          (session.mode === 'diagnostic' || session.mode === 'benchmark' ? session.wallMs : session.activeMs)
      }
      modes.set(session.mode, values)
    }
    if (!measuredModes.has(session.mode)) continue
    if (!session.symbolStats) {
      for (const [key, stat] of Object.entries(session.keyStats ?? {})) {
        if (active.has(key)) add(legacy, key, stat)
      }
      continue
    }
    for (const [glyph, stat] of Object.entries(session.symbolStats)) {
      if (!active.has(glyph)) continue
      add(exact, glyph, stat, stat?.misses)
      if (session.mode === 'hardcore') {
        if (age < windowMs) add(drill, glyph, stat, stat?.misses)
        else if (age < 2 * windowMs) add(previousDrill, glyph, stat, stat?.misses)
      }
      if (!ordinary.has(session.mode)) continue
      if (age < windowMs) add(current, glyph, stat, stat?.misses)
      else if (age < 2 * windowMs) add(previous, glyph, stat, stat?.misses)
    }
  }
  return {
    modes: Object.fromEntries([...modes].map(([mode, { paceMs, paceChars, ...counts }]) => [mode, {
      ...counts,
      errorPercent: counts.totalKeys ? Math.round(1000 * counts.errors / counts.totalKeys) / 10 : null,
      wpm: paceMs > 0 ? Math.round(120_000 * paceChars / paceMs) / 10 : null,
    }])),
    keyboard: glyphs.map((glyph) => {
      const latest = describe(current.get(glyph))
      const prior = describe(previous.get(glyph))
      const hardcore = describe(drill.get(glyph))
      const hardcorePrevious = describe(previousDrill.get(glyph))
      return {
        glyph, all: describe(exact.get(glyph)), legacy: describe(legacy.get(glyph)),
        current: latest, previous: prior, changePoints: errorChange(latest, prior),
        hardcore, hardcorePrevious, hardcoreChangePoints: errorChange(hardcore, hardcorePrevious),
      }
    }),
  }
}

export function generateHardcore(history: readonly SessionResult[], layout: Layout, seed: number) {
  const allowed = new Set(keyboardGlyphs(layout).filter((glyph) => glyph !== 'space'))
  const counts: KeyboardEvidence = new Map()
  for (const session of history) {
    if (session.layout !== layout || !ordinary.has(session.mode)) continue
    for (const [glyph, stat] of Object.entries(session.symbolStats ?? session.keyStats ?? {})) {
      if (allowed.has(glyph)) add(counts, glyph, stat)
    }
  }
  const targets = [...counts].filter(([, stat]) => stat.attempts >= 4 && stat.errors > 0)
    .sort(([a, left], [b, right]) => right.errors - left.errors ||
      right.errors / right.attempts - left.errors / left.attempts || a.localeCompare(b, layout))
    .slice(0, 5)
    .map(([glyph]) => glyph)
  if (!targets.length) return undefined
  const pool = [...allowed].filter((glyph) => !targets.includes(glyph))
  const anchors = [...counts].filter(([glyph, stat]) => pool.includes(glyph) && stat.attempts >= 4 &&
    stat.errors * 10 <= stat.attempts).map(([glyph]) => glyph)
  const movement = anchors.length ? anchors : [...(layout === 'ru' ? 'фываолдж' : 'asdfjkl;')].filter((glyph) => pool.includes(glyph))
  const random = seededRandom(seed)
  const repeated = Array.from({ length: 72 }, (_, index) => targets[index % targets.length])
  for (let index = repeated.length - 1; index > 0; index--) {
    const from = Math.floor(random() * (index + 1))
    ;[repeated[index], repeated[from]] = [repeated[from], repeated[index]]
  }
  const position = (glyph: string) => {
    const row = glyphRows[layout].findIndex(([plain, shifted]) => (plain + shifted).includes(glyph))
    const [plain, shifted] = glyphRows[layout][row]
    return [row, Math.max(plain.indexOf(glyph), shifted.indexOf(glyph))]
  }
  const groups = Array.from({ length: 8 }, (_, index) => {
    const focal = repeated.slice(index * 9, (index + 1) * 9)
    const [row, column] = position(focal[8])
    const places = movement.length ? movement : pool
    const distant = places.filter((glyph) => {
      const [nextRow, nextColumn] = position(glyph)
      return nextRow !== row || Math.abs(nextColumn - column) >= 3
    })
    const candidates = distant.length ? distant : places
    return focal.join('') + candidates[Math.floor(random() * candidates.length)]
  })
  return { text: groups.join(' '), targets }
}

export function buildProgressReport(state: AppState, now = new Date()) {
  const layouts = ['ru', 'en'] as const
  const switches = state.sessions.filter((session) => {
    const age = now.getTime() - Date.parse(session.endedAt)
    return session.mode === 'layout-switch' && age >= 0 && age < windowMs
  }).flatMap((session) => session.layoutSwitches ?? [])
  return {
    schema: 'takt.progress.v1',
    profileId: state.profileId,
    generatedAt: now.toISOString(),
    currentFrom: new Date(now.getTime() - windowMs).toISOString(),
    previousFrom: new Date(now.getTime() - 2 * windowMs).toISOString(),
    ordinaryModes: [...ordinary],
    minimumPerPeriodForChange: comparisonMinimum,
    layouts: Object.fromEntries(layouts.map((layout) => [layout, keyboardProgress(state.sessions, layout, now)])),
    layoutSwitch: Object.fromEntries(layouts.map((layout) => {
      const reached = switches.filter((sample) => sample.layout === layout)
      const latencies = reached.map((sample) => sample.latencyMs)
      return [layout, {
        attempts: reached.length, wrongFirst: reached.filter((sample) => sample.wrongFirst).length,
        medianMs: latencies.length ? percentile(latencies, 50) : null,
        p95Ms: latencies.length ? percentile(latencies, 95) : null,
      }]
    })),
  }
}
