import type { AppState, DesktopInfo, SessionResult } from '@/types'
import { isLanguage, preferredLanguage } from './language'

const STORAGE_KEY = 'klavish-state-v1'

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function defaultState(): AppState {
  const language = preferredLanguage()
  return {
    version: 1,
    profileId: createId(),
    createdAt: new Date().toISOString(),
    sessions: [],
    lessonProgress: {},
    achievements: {},
    settings: { language, layout: language === 'ru' ? 'ru' : 'en', sound: true, showKeyboard: true, lessonLength: 'normal', theme: 'waves' },
  }
}

function normalizeState(value: AppState | null): AppState {
  if (value === null) return defaultState()
  if (value?.version !== 1) throw new Error('Неподдерживаемый формат профиля')
  const fallback = defaultState()
  return {
    ...fallback,
    ...value,
    sessions: Array.isArray(value.sessions) ? value.sessions : [],
    lessonProgress: value.lessonProgress || {},
    achievements: value.achievements || {},
    settings: {
      ...fallback.settings, ...value.settings,
      language: isLanguage(value.settings?.language) ? value.settings.language : 'ru',
      theme: value.settings?.theme === 'dark' ? 'dark' : 'waves',
    },
  }
}

export async function loadState(): Promise<AppState> {
  if (window.klavish) return normalizeState(await window.klavish.load())
  const raw = localStorage.getItem(STORAGE_KEY)
  return normalizeState(raw === null ? null : JSON.parse(raw))
}

export async function saveState(state: AppState, session?: SessionResult): Promise<void> {
  if (window.klavish) return window.klavish.save(state, session)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export async function getDesktopInfo(): Promise<DesktopInfo> {
  if (window.klavish) return window.klavish.getInfo()
  return { isDesktop: false, platform: 'web', arch: 'browser', version: 'preview' }
}

function download(content: string, type: string, extension: string, purpose?: 'progress'): string {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `takt-${purpose ?? 'export'}-${new Date().toISOString().slice(0, 10)}.${extension}`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return link.download
}

export async function exportFile(format: 'json' | 'csv', content: string, purpose?: 'progress'): Promise<string | null> {
  const language = document.documentElement.lang
  if (window.klavish) return window.klavish.exportData(format, content, purpose, isLanguage(language) ? language : undefined)
  return download(content, format === 'json' ? 'application/json' : 'text/csv;charset=utf-8', format, purpose)
}

export async function openLogs(): Promise<string | null> {
  if (window.klavish) return window.klavish.openLogs()
  return null
}

export function sessionsToCsv(sessions: SessionResult[]): string {
  const headers = ['id', 'endedAt', 'mode', 'layout', 'lessonId', 'level', 'activeMs', 'wallMs', 'correctChars', 'errors', 'accuracy', 'wpm', 'cpm', 'bestStreak', 'meanLatencyMs', 'p95LatencyMs', 'score']
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const rows = sessions.map((session) => headers.map((header) => escape(session[header as keyof SessionResult])).join(','))
  return `\uFEFF${headers.join(',')}\n${rows.join('\n')}`
}
