import { glyphRows } from '@/lib/keyboardLayout'
import type { Layout, SessionResult } from '@/types'

export const MIN_EXCERPT_LENGTH = 80
export const MAX_SOURCE_LENGTH = 12_000
export const MAX_TEXT_FILE_BYTES = 128_000

const EXCERPT_LENGTH = 180
const supportedCharacters = new Set([' ', ...Object.values(glyphRows).flat(2).join('')])

function normalizeText(source: string) {
  const punctuation = source.normalize('NFKC')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[«»„“”]/g, '"')
    .replace(/[‘’]/g, "'")
  return [...punctuation].map((char) => supportedCharacters.has(char) ? char : ' ').join('')
    .replace(/\s+/g, ' ').trim().slice(0, MAX_SOURCE_LENGTH).trim()
}

function excerptFrom(text: string) {
  if (text.length <= EXCERPT_LENGTH) return text
  const lastWord = text.lastIndexOf(' ', EXCERPT_LENGTH)
  return text.slice(0, lastWord >= MIN_EXCERPT_LENGTH ? lastWord : EXCERPT_LENGTH).trim()
}

function layoutOfExcerpt(text: string): Layout | null {
  const cyrillic = /[а-яё]/iu.test(text)
  const latin = /[a-z]/iu.test(text)
  if (cyrillic === latin) return null
  return cyrillic ? 'ru' : 'en'
}

function overlappingExcerpts(first: string, second: string) {
  const words = (value: string) => value.toLowerCase().match(/[a-zа-яё0-9]+/gu) ?? []
  const passages = [words(first), words(second)].sort((left, right) => left.length - right.length)
  const [shorter, longer] = passages
  const allowedEdits = shorter.length < 3 ? 0 : Math.max(1, Math.floor(shorter.length / 5))

  // Free leading and trailing words allow matching a near-copy inside a longer excerpt.
  let previous = Array<number>(longer.length + 1).fill(0)
  for (const [row, currentWord] of shorter.entries()) {
    const distances = [row + 1]
    for (const [column, candidateWord] of longer.entries()) {
      distances.push(Math.min(
        previous[column + 1] + 1,
        distances[column] + 1,
        previous[column] + (currentWord === candidateWord ? 0 : 1),
      ))
    }
    previous = distances
  }
  return Math.min(...previous) <= allowedEdits
}

export function splitTransferText(source: string): { practice: string; control: string; layout: Layout } | null {
  const text = normalizeText(source)
  const midpoint = Math.floor(text.length / 2)
  const leftBoundary = text.lastIndexOf(' ', midpoint)
  const boundary = leftBoundary >= MIN_EXCERPT_LENGTH ? leftBoundary : text.indexOf(' ', midpoint)
  if (boundary < MIN_EXCERPT_LENGTH || text.length - boundary - 1 < MIN_EXCERPT_LENGTH) return null

  const practice = excerptFrom(text.slice(0, boundary))
  const control = excerptFrom(text.slice(boundary + 1))
  const layout = layoutOfExcerpt(practice)
  if (!layout || layout !== layoutOfExcerpt(control) || overlappingExcerpts(practice, control)) return null
  return { practice, control, layout }
}

export function decodeTextFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
  let text: string
  try {
    text = new TextDecoder(bom, { fatal: true }).decode(bytes)
  } catch {
    if (bom !== 'utf-8') throw new Error('Повреждённый текст UTF-16')
    text = new TextDecoder('windows-1251').decode(bytes)
  }
  if (text.includes('\0')) throw new Error('Файл должен содержать только текст')
  return text
}

export function summarizeTransfer(session: SessionResult, transferRunId: string): SessionResult {
  return {
    schemaVersion: 1,
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    mode: session.mode,
    layout: session.layout,
    completedText: session.completedText,
    transferRunId,
    firstPassAccuracy: session.firstPassAccuracy,
    firstPassErrors: session.firstPassErrors,
    level: 0,
    activeMs: session.activeMs,
    wallMs: session.wallMs,
    totalKeys: session.totalKeys,
    correctChars: session.correctChars,
    errors: session.errors,
    backspaces: session.backspaces,
    bestStreak: session.bestStreak,
    cpm: session.cpm,
    wpm: session.wpm,
    accuracy: session.accuracy,
    meanLatencyMs: session.meanLatencyMs,
    p95LatencyMs: session.p95LatencyMs,
    score: session.score,
    keyStats: {},
    confusions: {},
    samples: [],
  }
}

export const SWITCH_COUNT = 12

export interface SwitchCue {
  layout: Layout
  code: string
  key: string
}

export function switchCues(firstLayout: Layout): SwitchCue[] {
  const secondLayout = firstLayout === 'ru' ? 'en' : 'ru'
  return [0, 1, 2, 3, 6, 7, 8, 3, 2, 1, 0, 7, 8].map((column, index) => {
    const layout = index % 2 === 0 ? firstLayout : secondLayout
    return { layout, code: 'Key' + glyphRows.en[2][0][column].toUpperCase(), key: glyphRows[layout][2][0][column] }
  })
}

export function matchesSwitchCue(cue: SwitchCue, key: string, code: string): boolean {
  return code === cue.code && key.toLocaleLowerCase() === cue.key
}

export function switchMeasurement(
  cue: SwitchCue,
  openedAt: number,
  confirmedAt: number,
  wrongFirst: boolean,
): NonNullable<SessionResult['layoutSwitches']>[number] {
  return { layout: cue.layout, latencyMs: Math.max(0, Math.round(confirmedAt - openedAt)), wrongFirst }
}

