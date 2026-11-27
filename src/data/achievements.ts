import { Award, CalendarDays, Crosshair, Flame, Gauge, Medal, Orbit, Sparkles, Timer, Trophy } from 'lucide-react'
import type { AppState, SessionResult } from '@/types'
import { aggregate, isPaceSample, practiceDayStreak, TREND_MIN_ACTIVE_SECONDS, TREND_MIN_CORRECT_CHARS } from '@/lib/analytics'

export interface AchievementDefinition {
  id: string
  title: string
  description: string
  icon: typeof Award
  target: number
  unit: string
  value: (state: AppState) => number
}

const max = (sessions: SessionResult[], selector: (session: SessionResult) => number) => sessions.reduce((value, session) => Math.max(value, selector(session)), 0)

export const achievements: AchievementDefinition[] = [
  { id: 'first', title: 'Первый контакт', description: 'Завершите первую тренировку', icon: Sparkles, target: 1, unit: 'тренировка', value: (state) => state.sessions.length },
  { id: 'ten-sessions', title: 'В ритме', description: 'Завершите 10 тренировок', icon: CalendarDays, target: 10, unit: 'тренировок', value: (state) => state.sessions.length },
  { id: 'thousand', title: 'Тысяча знаков', description: 'Наберите 1 000 правильных знаков', icon: Medal, target: 1000, unit: 'знаков', value: (state) => aggregate(state.sessions).correct },
  { id: 'hour', title: 'Час практики', description: 'Накопите 60 минут активного набора', icon: Timer, target: 60, unit: 'минут', value: (state) => Math.floor(aggregate(state.sessions).activeMs / 60000) },
  { id: 'streak-50', title: 'Без срыва', description: 'Серия из 50 знаков без ошибки', icon: Flame, target: 50, unit: 'знаков', value: (state) => max(state.sessions, (session) => session.bestStreak) },
  { id: 'streak-150', title: 'Автопилот', description: 'Серия из 150 знаков без ошибки', icon: Crosshair, target: 150, unit: 'знаков', value: (state) => max(state.sessions, (session) => session.bestStreak) },
  { id: 'accurate', title: 'Почти идеально', description: '98% точности в тексте от 80 знаков', icon: Crosshair, target: 98, unit: '% точности', value: (state) => max(state.sessions.filter((session) => session.correctChars >= 80), (session) => session.accuracy) },
  { id: 'speed-40', title: 'Уверенный темп', description: `Достигните 40 слов в минуту за попытку с ${TREND_MIN_ACTIVE_SECONDS} секундами активного набора и ${TREND_MIN_CORRECT_CHARS} правильными знаками или больше`, icon: Gauge, target: 40, unit: 'сл/мин', value: (state) => max(state.sessions.filter(isPaceSample), (session) => session.wpm) },
  { id: 'speed-60', title: 'Быстрее мысли', description: `Достигните 60 слов в минуту за попытку с ${TREND_MIN_ACTIVE_SECONDS} секундами активного набора и ${TREND_MIN_CORRECT_CHARS} правильными знаками или больше`, icon: Trophy, target: 60, unit: 'сл/мин', value: (state) => max(state.sessions.filter(isPaceSample), (session) => session.wpm) },
  { id: 'seven-days', title: 'Неделя за клавиатурой', description: '7 дней практики подряд', icon: CalendarDays, target: 7, unit: 'дней', value: (state) => practiceDayStreak(state.sessions) },
  { id: 'orbit-1000', title: 'Защитник орбиты', description: 'Наберите 1 000 очков в «Орбите»', icon: Orbit, target: 1000, unit: 'очков', value: (state) => max(state.sessions.filter((session) => session.mode === 'orbit'), (session) => session.score) },
  { id: 'lessons-6', title: 'Половина пути', description: 'Завершите 6 разных уроков', icon: Award, target: 6, unit: 'уроков', value: (state) => Object.values(state.lessonProgress).filter((lesson) => lesson.completed).length },
]
