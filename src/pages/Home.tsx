import { ArrowRight, BrainCircuit, Clock3, Crosshair, Flame, FlaskConical, Gauge, Keyboard, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAppState } from '@/hooks/useAppState'
import { aggregate, dailySeries, dateKey, observedSessions, practiceDayStreak, speedTrend, TREND_MIN_DAYS, weakKeys, weeklySpeedComparison } from '@/lib/analytics'
import { displayKey } from '@/lib/metrics'
import { lessonDifficulty, lessonsFor, sessionLabel } from '@/data/lessons'
import { StatCard } from '@/components/StatCard'
import { dueReviewPairs, nextCourseLesson } from '@/lib/learning'
import { hasTextPace, isLessonPaceSession, isPracticeActivityMode, isPracticePaceMode, lessonPaceObservation } from '@/lib/sessionModes'
import { useI18n } from '@/lib/i18n'

export default function Home() {
  const { t, locale } = useI18n()
  const { state } = useAppState()
  const lesson = nextCourseLesson(state, state.settings.layout)
  const difficulty = lessonDifficulty(lesson, state)
  const course = lessonsFor(lesson.layout)
  const completed = course.filter((item) => state.lessonProgress[item.id]?.completed).length
  const history = observedSessions(state.sessions)
  const lessonPace = history.filter(isLessonPaceSession).map(lessonPaceObservation)
  const activity = history.filter(({ mode }) => isPracticeActivityMode(mode))
  const todayKey = dateKey(new Date())
  const todayLessons = lessonPace.filter(({ endedAt }) => dateKey(endedAt) === todayKey)
  const todayStats = aggregate(todayLessons)
  const hasTodayPace = todayLessons.length > 0
  const hasTodayAccuracy = todayLessons.some(({ totalKeys }) => totalKeys > 0)
  const recent = [...history].sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt)).slice(0, 6)
  const trend = speedTrend(lessonPace)
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const date = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' })
  const signed = (value: number) => (value > 0 ? '+' : '') + format.format(value)
  const weeklyComparison = weeklySpeedComparison(lessonPace, t)
  const week = dailySeries(lessonPace, 7).map((point) => ({ ...point, label: date.format(new Date(point.date + 'T00:00:00')) }))
  const ordinaryEvidence = history.filter(({ mode, layout }) => layout === lesson.layout && isPracticePaceMode(mode))
  const weak = weakKeys(ordinaryEvidence.slice(-10), 4)
  const dayStreak = practiceDayStreak(activity)
  const review = dueReviewPairs(state, lesson.layout)
  const dailyGoal = 15
  const activeToday = activity.filter(({ endedAt }) => dateKey(endedAt) === todayKey)
    .reduce((sum, { activeMs }) => sum + activeMs, 0)
  const todayMinutes = Math.round(activeToday / 6000) / 10
  const goalPercent = Math.min(100, Math.round((todayMinutes / dailyGoal) * 100))

  return (
    <div className="page home-page">
      <section className="home-hero">
        <div>
          <Link to="/settings" className="section-tag"><Sparkles size={15} />{state.settings.profileName || t('Локальный профиль')}</Link>
          <h1>{t(history.length ? 'Продолжим вырабатывать ритм.' : 'Пальцы запомнят дорогу.')}</h1>
          <p>{t("Короткие уроки, честная статистика и адаптивные тексты — без взгляда на клавиатуру.")}</p>
        </div>
        <div className="hero-actions">
          <Link className="button primary" to={`/practice/${lesson.id}`}><Keyboard size={19} />{t(history.length ? 'Продолжить' : 'Начать урок')}<ArrowRight size={18} /></Link>
          <Link className="button ghost" to="/practice/adaptive"><BrainCircuit size={18} />{t('Адаптивная тренировка')}</Link>
          <Link className="button ghost" to="/training-lab"><FlaskConical size={18} aria-hidden="true" />{t('Лаборатория тренировки')}</Link>
          {review.length > 0 && <Link className="button ghost" to={`/practice/review?layout=${lesson.layout}`}>{t('Повторить сегодня ({count})', { count: review.length })}</Link>}
        </div>
      </section>

      <section className="stats-grid" aria-label={t('Сводка за сегодня')}>
        <StatCard label={t('Темп уроков сегодня')} value={hasTodayPace ? format.format(todayStats.wpm) : '—'} unit={hasTodayPace ? t('сл/мин') : undefined} icon={Gauge} accent detail={weeklyComparison} />
        <StatCard label={t('Точность уроков')} value={hasTodayAccuracy ? format.format(todayStats.accuracy) : '—'} unit={hasTodayAccuracy ? '%' : undefined} icon={Crosshair} detail={hasTodayAccuracy ? t('{count} ошибок в уроках сегодня', { count: todayStats.errors }) : t('Сегодня пока без замера урока')} />
        <StatCard label={t('Активное время практики')} value={format.format(todayMinutes)} unit={t('мин')} icon={Clock3} detail={t('Цель дня — {minutes} минут', { minutes: dailyGoal })} />
        <StatCard label={t('Дней практики подряд')} value={dayStreak} unit={t(dayStreak === 1 ? 'день' : 'дней')} icon={Flame} detail={t('Лучшая серия в уроках сегодня · {count} знаков', { count: todayStats.bestStreak })} />
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-heading"><div><span>{t("Динамика")}</span><h2>{t("Темп уроков за неделю")}</h2></div><strong className={trend.wpmPerWeek >= 0 ? 'positive' : 'negative'}>{trend.ready ? t('Тренд по истории · {change} сл/мин в неделю', { change: signed(trend.wpmPerWeek) }) : t('Для тренда нужны подходящие уроки в {days} разных днях', { days: TREND_MIN_DAYS })}</strong></div>
          <div className="chart-box" aria-label={t('График скорости за семь дней')}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={week} margin={{ top: 16, right: 8, left: -24, bottom: 0 }}>
                <defs><linearGradient id="speedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--lime)" stopOpacity={0.32} /><stop offset="100%" stopColor="var(--lime)" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-text)', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-text)', fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' }} formatter={(value) => [t('{value} сл/мин', { value: typeof value === 'number' ? format.format(value) : String(value ?? '') }), t('Скорость')]} labelFormatter={(label) => t('Дата: {date}', { date: String(label) })} />
                <Area type="monotone" dataKey="wpm" stroke="var(--lime)" strokeWidth={2.5} fill="url(#speedFill)" dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel goal-panel">
          <div className="panel-heading"><div><span>{t("Регулярность")}</span><h2>{t("Цель на сегодня")}</h2></div></div>
          <div className="goal-ring" style={{ '--goal': `${goalPercent * 3.6}deg` } as React.CSSProperties}><div><strong>{goalPercent}%</strong><span>{t('{current} из {total} мин', { current: format.format(todayMinutes), total: dailyGoal })}</span></div></div>
          <p>{goalPercent >= 100 ? t('Цель выполнена. Отличная работа!') : t('Ещё {minutes} мин спокойной практики.', { minutes: Math.max(0, Math.ceil(dailyGoal - todayMinutes)) })}</p>
        </article>
      </section>

      <section className="dashboard-grid lower-grid">
        <article className="panel">
          <div className="panel-heading"><div><span>{t("Персональный фокус")}</span><h2>{t("Клавиши с ошибками")}</h2></div><Link to="/practice/adaptive" className="text-link">{t('Тренировать')} <ArrowRight size={15} /></Link></div>
          {weak.length ? <div className="weak-key-list">{weak.map((item) => <div key={item.key} className="weak-key-row"><kbd>{t(displayKey(item.key))}</kbd><div><strong>{t('{value}% ошибок', { value: format.format(item.errorRate) })}</strong><span>{t('{ms} мс средняя задержка', { ms: format.format(item.latencyMs) })}</span></div><div className="error-meter"><i style={{ width: `${Math.min(100, item.errorRate * 4)}%` }} /></div></div>)}</div> : <div className="empty-inline"><Crosshair size={24} /><p>{t("Здесь появятся клавиши, для которых накопилось достаточно попыток и были ошибки.")}</p></div>}
        </article>
        <article className="panel next-lesson-panel">
          <span className="lesson-number">{String(lesson.level).padStart(2, '0')}</span>
          <div><span>{t(state.lessonProgress[course[course.length - 1].id]?.completed ? 'Курс завершён' : 'Следующий урок')} · {lesson.layout.toUpperCase()} · {t('{completed} из {total}', { completed, total: course.length })}</span><h2>{t(lesson.title)}</h2><p>{t(lesson.subtitle)}</p></div>
          <div className="lesson-target"><span>{difficulty.increasePercent ? t('Цель · +{increase}% к темпу', { increase: difficulty.increasePercent }) : t('Цель')}</span><strong>{t('{value} сл/мин', { value: format.format(difficulty.targetWpm) })} · {lesson.minAccuracy}%</strong></div>
          <Link className="button primary" to={`/practice/${lesson.id}`}>{t('Начать')} <ArrowRight size={18} /></Link>
        </article>
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading"><div><span>{t("История")}</span><h2>{t("Последние тренировки")}</h2></div><Link className="text-link" to="/stats">{t('Вся статистика')} <ArrowRight size={15} /></Link></div>
        {recent.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>{t("Режим")}</th><th>{t("Дата")}</th><th>{t("Скорость")}</th><th>{t("Точность")}</th><th>{t("Время")}</th><th>{t("Серия")}</th></tr></thead>
              <tbody>{recent.map((session) => {
                const label = sessionLabel(session.mode)
                return (
                  <tr key={session.id}>
                    <td><strong>{t(session.lessonTitle ?? label)}</strong>{session.lessonTitle && session.lessonTitle !== label && <small className="table-subtitle">{t(label)}</small>}</td>
                    <td>{new Date(session.endedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</td>
                    <td>{hasTextPace(session.mode) ? t('{value} сл/мин', { value: format.format(session.wpm) }) : '—'}</td>
                    <td>{session.totalKeys > 0 ? format.format(session.accuracy) + '%' : '—'}</td>
                    <td>{t('{minutes} мин', { minutes: format.format(Math.round(session.activeMs / 6000) / 10) })}</td>
                    <td>{session.bestStreak}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        ) : <div className="empty-state"><Keyboard size={30} /><h3>{t("Пока нет завершённых тренировок")}</h3><p>{t("Начните с домашнего ряда — это займёт всего пару минут.")}</p><Link className="button secondary" to={`/practice/${lesson.id}`}>{t("Перейти к первому уроку")}</Link></div>}
      </section>
    </div>
  )
}
