export type Layout = 'ru' | 'en'
export type Language = 'en' | 'ru' | 'es' | 'fr' | 'de' | 'pt'
export type Theme = 'waves' | 'dark'
export type SessionMode = 'lesson' | 'adaptive' | 'orbit' | 'sprint' | 'precision' | 'review' | 'diagnostic' | 'benchmark'
  | 'transition' | 'transfer-practice' | 'transfer-control' | 'layout-switch' | 'hardcore'

export interface Lesson {
  id: string
  layout: Layout
  level: number
  title: string
  subtitle: string
  keys: string
  targetWpm: number
  minAccuracy: number
  words: string[]
  patterns?: string[]
}

export interface KeyMetric {
  attempts: number
  errors: number
  latencyMs: number
  latencySamples: number
}

export interface SymbolMetric {
  attempts: number
  errors: number
  misses: Record<string, number>
}

export interface SessionSample {
  atMs: number
  correctChars: number
  errors: number
  activeMs: number
}

export interface KeyPair {
  expected: string
  actual: string
}

export interface LetterTransition {
  from: string
  to: string
}

export interface LayoutSwitchSample {
  layout: Layout
  latencyMs: number
  wrongFirst: boolean
}

export interface SessionResult {
  schemaVersion: 1
  id: string
  startedAt: string
  endedAt: string
  mode: SessionMode
  layout: Layout
  lessonId?: string
  lessonTitle?: string
  completedText?: boolean
  targetWpm?: number
  lessonScored?: { correctChars: number; activeMs: number; totalKeys: number; errors: number }
  assessmentId?: string
  weekKey?: string
  reviewPairs?: KeyPair[]
  transitionPairs?: LetterTransition[]
  transitions?: Record<string, number[]>
  transferRunId?: string
  firstPassAccuracy?: number
  firstPassErrors?: number
  layoutSwitches?: LayoutSwitchSample[]
  level: number
  activeMs: number
  wallMs: number
  totalKeys: number
  correctChars: number
  errors: number
  backspaces: number
  bestStreak: number
  cpm: number
  wpm: number
  accuracy: number
  meanLatencyMs: number
  p95LatencyMs: number
  score: number
  keyStats: Record<string, KeyMetric>
  symbolStats?: Record<string, SymbolMetric>
  confusions: Record<string, number>
  samples: SessionSample[]
}

export interface LessonProgress {
  attempts: number
  completed: boolean
  bestWpm: number
  bestAccuracy: number
  lastAt?: string
  targetWpm?: number
  increasePercent?: 5 | 10 | 15
}

export interface Settings {
  profileName?: string
  language?: Language
  theme: Theme
  layout: Layout
  sound: boolean
  showKeyboard: boolean
  lessonLength: 'short' | 'normal' | 'long'
}

export interface AppState {
  version: 1
  profileId: string
  createdAt: string
  sessions: SessionResult[]
  lessonProgress: Record<string, LessonProgress>
  achievements: Record<string, string>
  settings: Settings
}

export interface LogEvent {
  schema: 'klavish.event.v1'
  type: 'session_completed'
  recordedAt: string
  appVersion: string
  data: SessionResult
}

export interface DesktopInfo {
  isDesktop: boolean
  platform: string
  arch: string
  version: string
  logDirectory?: string
}

export interface DesktopBridge {
  load: () => Promise<AppState | null>
  save: (state: AppState, session?: SessionResult) => Promise<void>
  exportData: (format: 'json' | 'csv', content: string, purpose?: 'progress', language?: Language) => Promise<string | null>
  openLogs: () => Promise<string | null>
  clearData: (state: AppState) => Promise<void>
  getInfo: () => Promise<DesktopInfo>
}

declare global {
  interface Window {
    klavish?: DesktopBridge
  }
}
