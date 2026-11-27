/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { AppState, LessonProgress, SessionResult, Settings } from '@/types'
import { achievements, type AchievementDefinition } from '@/data/achievements'
import { lessonDifficulty, lessons, nextLessonDifficulty } from '@/data/lessons'
import { defaultState, loadState, saveState } from '@/lib/storage'
import { clearStoredData } from '@/lib/clearData'
import { isPaceSample } from '@/lib/analytics'
import { acceptsAssessment, benchmarkForWeek, isAssessment, isCourseLessonAvailable, practiceOnly } from '@/lib/learning'
import { isPracticePaceMode } from '@/lib/sessionModes'
import { translate } from '@/lib/messages'

interface AppStateContextValue {
  state: AppState
  recordSession: (session: SessionResult) => Promise<AchievementDefinition[]>
  updateSettings: (settings: Partial<Settings>) => Promise<void>
  resetProgress: () => Promise<void>
}

const AppStateContext = createContext<AppStateContextValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState)
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const language = state.settings.language ?? 'ru'
  const stateRef = useRef(state)
  const writes = useRef(Promise.resolve())
  const refreshAfterFailure = useRef(false)
  useEffect(() => { document.documentElement.lang = language }, [language])

  useEffect(() => {
    let active = true
    loadState().then((loaded) => {
      if (active) {
        stateRef.current = loaded
        setState(loaded)
        setLoadStatus('ready')
      }
    }).catch(() => {
      if (active) setLoadStatus('error')
    })
    return () => { active = false }
  }, [loadAttempt])

  const enqueue = useCallback(<T,>(write: () => Promise<T>, refresh = true) => {
    const result = writes.current.then(async () => {
      if (refresh && refreshAfterFailure.current) {
        const recovered = await loadState()
        stateRef.current = recovered
        setState(recovered)
        refreshAfterFailure.current = false
      }
      return write()
    })
    writes.current = result.then(() => {}, () => {})
    return result
  }, [])

  const commit = useCallback(async (next: AppState, session?: SessionResult) => {
    try {
      await saveState(next, session)
    } catch (error) {
      // Desktop may have staged a recoverable write before the renderer saw the error.
      refreshAfterFailure.current = Boolean(window.klavish)
      throw error
    }
    stateRef.current = next
    setState(next)
  }, [])

  const recordSession = useCallback((session: SessionResult) => enqueue(async () => {
    const current = stateRef.current
    if (current.sessions.some((saved) => saved.id === session.id)) return []
    if (isAssessment(session.mode) && !acceptsAssessment(session)) throw new Error('Проверочная попытка неполная')
    if (session.mode === 'benchmark' && benchmarkForWeek(current, session.layout, session.weekKey)) throw new Error('На этой неделе уже есть контрольный результат')
    const next: AppState = { ...current, sessions: [...current.sessions, session], lessonProgress: { ...current.lessonProgress }, achievements: { ...current.achievements } }
    const lesson = session.mode === 'lesson' ? lessons.find((item) => item.id === session.lessonId && item.layout === session.layout) : undefined
    if (lesson) {
      if (!isCourseLessonAvailable(lesson, current)) throw new Error('Урок пока закрыт')
      const previous = current.lessonProgress[lesson.id] ?? { attempts: 0, completed: false, bestWpm: 0, bestAccuracy: 0 }
      const difficulty = lessonDifficulty(lesson, current)
      const targetWpm = session.targetWpm ?? difficulty.targetWpm
      const passed = session.completedText === true && session.accuracy >= lesson.minAccuracy && session.wpm >= targetWpm
      const progress: LessonProgress = {
        ...previous,
        targetWpm,
        increasePercent: difficulty.increasePercent,
        attempts: previous.attempts + 1,
        completed: previous.completed || passed,
        bestWpm: isPaceSample(session) ? Math.max(previous.bestWpm, session.wpm) : previous.bestWpm,
        bestAccuracy: Math.max(previous.bestAccuracy, session.accuracy),
        lastAt: session.endedAt,
      }
      next.lessonProgress[lesson.id] = progress

      if (passed && !previous.completed) {
        const successor = nextLessonDifficulty(lesson, targetWpm, session, true)
        if (successor) {
          const prior = current.lessonProgress[successor.lesson.id]
          if (!prior?.completed && prior?.targetWpm === undefined) {
            next.lessonProgress[successor.lesson.id] = {
              ...(prior ?? { attempts: 0, completed: false, bestWpm: 0, bestAccuracy: 0 }),
              targetWpm: successor.targetWpm, increasePercent: successor.increasePercent,
            }
          }
        }
      }
    }
    const unlocked: AchievementDefinition[] = []
    if (isPracticePaceMode(session.mode)) {
      const achievementState = practiceOnly(next)
      achievements.forEach((achievement) => {
        if (!next.achievements[achievement.id] && achievement.value(achievementState) >= achievement.target) {
          next.achievements[achievement.id] = session.endedAt
          unlocked.push(achievement)
        }
      })
    }
    await commit(next, session)
    return unlocked
  }), [commit, enqueue])

  const updateSettings = useCallback(async (settings: Partial<Settings>) => {
    try {
      await enqueue(() => commit({ ...stateRef.current, settings: { ...stateRef.current.settings, ...settings } }))
    } catch {
      toast.error(translate(stateRef.current.settings.language ?? 'ru', 'Не удалось сохранить настройки.'))
    }
  }, [commit, enqueue])

  const resetProgress = useCallback(() => enqueue(async () => {
    const next: AppState = { ...stateRef.current, sessions: [], lessonProgress: {}, achievements: {} }
    try {
      await clearStoredData(next)
    } catch (error) {
      refreshAfterFailure.current = Boolean(window.klavish)
      throw error
    }
    refreshAfterFailure.current = false
    stateRef.current = next
    setState(next)
  }, false), [enqueue])

  const value = useMemo(() => ({ state, recordSession, updateSettings, resetProgress }), [state, recordSession, updateSettings, resetProgress])
  if (loadStatus === 'loading') return <main className="page"><p role="status">{translate(language, 'takt.. · загружаем профиль…')}</p></main>
  if (loadStatus === 'error') {
    return (
      <main className="page" aria-label="takt..">
        <h1>{translate(language, 'Не удалось открыть профиль')}</h1>
        <p role="alert">{translate(language, 'Повтори загрузку после восстановления доступа к данным.')}</p>
        <button className="button primary" onClick={() => {
          setLoadStatus('loading')
          setLoadAttempt((attempt) => attempt + 1)
        }}>{translate(language, 'Повторить загрузку')}</button>
      </main>
    )
  }
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState() {
  const value = useContext(AppStateContext)
  if (!value) throw new Error('useAppState must be used inside AppStateProvider')
  return value
}
