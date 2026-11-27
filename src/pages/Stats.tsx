import { useEffect, useState } from 'react'
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Braces, Clock3, Download, FileJson, FolderOpen, Gauge, Lightbulb, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useAppState } from '@/hooks/useAppState'
import { KeyboardProgress } from '@/components/KeyboardProgress'
import { benchmarkForm } from '@/data/practiceTexts'
import { aggregate, dailySeries, dateKey, observedSessions, speedTrend, TREND_MIN_ACTIVE_SECONDS, TREND_MIN_DAYS, TREND_MIN_CORRECT_CHARS, weakKeys, weeklySpeedComparison } from '@/lib/analytics'
import { assessmentWeekKey, isAcceptedBenchmark, isCalibratedBenchmark } from '@/lib/learning'
import { useI18n } from '@/lib/i18n'
import { displayKey } from '@/lib/metrics'
import { exportFile, getDesktopInfo, openLogs, sessionsToCsv } from '@/lib/storage'
import { sessionLabel } from '@/data/lessons'
import { hasTextPace, isLessonPaceSession, isPracticeActivityMode, isPracticePaceMode, lessonPaceObservation } from '@/lib/sessionModes'
import { StatCard } from '@/components/StatCard'
import type { DesktopInfo, Layout, SessionResult } from '@/types'
import './StatsBenchmark.css'

const layouts: Layout[] = ['ru', 'en']
const layoutLabels = { ru: 'Русская', en: 'Английская' }

function BenchmarkProgress({ sessions, defaultLayout }: { sessions: SessionResult[]; defaultLayout: Layout }) {
  const { t, locale } = useI18n()
  const measurements = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const differences = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
  const percentage = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })
  const measurementDate = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const [params, setParams] = useSearchParams()
  const requestedLayout = params.get('layout')
  const layout = requestedLayout === 'ru' || requestedLayout === 'en' ? requestedLayout : defaultLayout
  const weekKey = assessmentWeekKey()
  const weekly = sessions.filter((session): session is SessionResult & { weekKey: string } =>
    session.layout === layout && typeof session.weekKey === 'string' && isAcceptedBenchmark(session),
  ).sort((a, b) => b.weekKey.localeCompare(a.weekKey))
  const latest = weekly[0]
  const form = latest && isCalibratedBenchmark(latest) ? benchmarkForm(layout, new Date(latest.startedAt)) : undefined
  const comparable = form === undefined ? [] : weekly.filter((session) => isCalibratedBenchmark(session) &&
    benchmarkForm(layout, new Date(session.startedAt)) === form)
  const previous = comparable[1]
  const best = (comparable.length ? comparable : weekly).reduce<SessionResult | undefined>((best, session) =>
    !best || session.wpm > best.wpm || (session.wpm === best.wpm && session.accuracy > best.accuracy) ? session : best,
  undefined)
  const madeThisWeek = weekly.some((session) => session.weekKey === weekKey)

  const selectLayout = (layout: Layout) => {
    const nextParams = new URLSearchParams(params)
    nextParams.set('layout', layout)
    setParams(nextParams, { replace: true })
  }

  return (
    <section className="panel benchmark-progress" aria-labelledby="benchmark-title">
      <header className="benchmark-heading">
        <div>
          <h2 id="benchmark-title">{t("Еженедельный замер")}</h2>
          <p>{t("45 секунд набора. Начало текста меняется каждую неделю. Сравниваются замеры на одном варианте. Новая неделя начинается в понедельник по UTC.")}</p>
        </div>
        <div className="segmented" role="group" aria-label={t("Раскладка замера")}>
          {layouts.map((option) => (
            <button key={option} type="button" aria-pressed={layout === option} className={layout === option ? 'selected' : ''} onClick={() => selectLayout(option)}>
              {t(layoutLabels[option])}
            </button>
          ))}
        </div>
      </header>

      {latest && best ? (
        <>
          <dl className="benchmark-summary">
            <div>
              <dt>{t("Последний замер")}</dt>
              <dd>{measurements.format(latest.wpm)} {t('сл/мин')} · {percentage.format(latest.accuracy / 100)}</dd>
              <dd className="benchmark-detail">{measurementDate.format(new Date(latest.endedAt))}{isCalibratedBenchmark(latest) ? '' : ' · ' + t('прежний набор текстов')}</dd>
            </div>
            <div>
              <dt>{comparable.length ? t("Лучший темп на этом варианте") : t("Лучший исторический темп")}</dt>
              <dd>{measurements.format(best.wpm)} {t('сл/мин')} · {percentage.format(best.accuracy / 100)}</dd>
              <dd className="benchmark-detail">{measurementDate.format(new Date(best.endedAt))}</dd>
            </div>
            <div>
              <dt>{t("К прошлому замеру того же варианта")}</dt>
              {previous
                ? <><dd>{differences.format(latest.wpm - previous.wpm)} {t('сл/мин')} · {differences.format(latest.accuracy - previous.accuracy)} {t('п.п.')}</dd>
                    <dd className="benchmark-detail">{measurementDate.format(new Date(previous.endedAt))}</dd></>
                : <dd className="benchmark-detail">{t("Для сравнения нужны два замера на одном варианте. Варианты чередуются каждые четыре недели.")}</dd>}
            </div>
          </dl>
          {weekly.length > 1 && (
            <div className="table-scroll">
              <table>
                <caption>{t("Последние замеры · {layout}", { layout: t(layoutLabels[layout]) })}</caption>
                <thead><tr><th scope="col">{t("Неделя ISO")}</th><th scope="col">{t("Дата")}</th><th scope="col">{t("Скорость")}</th><th scope="col">{t("Точность")}</th></tr></thead>
                <tbody>
                  {weekly.slice(0, 6).map((session) => (
                    <tr key={session.id}>
                      <td>{session.weekKey}</td>
                      <td>{measurementDate.format(new Date(session.endedAt))}</td>
                      <td>{measurements.format(session.wpm)} {t('сл/мин')}</td>
                      <td>{percentage.format(session.accuracy / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : <p className="benchmark-empty">{t("Пройдите первый замер, чтобы получить точку отсчёта для этой раскладки.")}</p>}

      <div className="benchmark-action">
        {madeThisWeek
          ? <p role="status">{t("Замер на этой неделе уже сохранён. Следующий доступен в понедельник.")}</p>
          : <Link className="button primary" to={'/practice/benchmark?layout=' + layout}>{t("Начать замер")} <ArrowRight size={17} aria-hidden="true" /></Link>}
      </div>
    </section>
  )
}

export default function Stats() {
  const { t, locale } = useI18n()
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const percentage = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })
  const signed = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
  const isRussian = locale.startsWith('ru')
  const number = (value: number) => decimal.format(value)
  const percent = (value: number) => isRussian ? decimal.format(value) + '%' : percentage.format(value / 100)
  const { state } = useAppState()
  const [params] = useSearchParams()
  const requestedLayout = params.get('layout')
  const keyboardLayout = requestedLayout === 'ru' || requestedLayout === 'en' ? requestedLayout : state.settings.layout
  const [period, setPeriod] = useState(30)
  const [info, setInfo] = useState<DesktopInfo | null>(null)
  const [exporting, setExporting] = useState(false)
  useEffect(() => { getDesktopInfo().then(setInfo) }, [])
  const history = observedSessions(state.sessions)
  const lessonPace = history.filter(isLessonPaceSession).map(lessonPaceObservation)
  const chartDate = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: period === 0 ? 'numeric' : undefined })
  const chartLabel = <T extends { date: string; label: string }>(row: T) => isRussian
    ? row
    : { ...row, label: chartDate.format(new Date(row.date + 'T12:00:00')) }
  const chart = dailySeries(lessonPace, period).map(chartLabel)
  const activityChart = dailySeries(history.filter(({ mode }) => isPracticeActivityMode(mode)), period).map(chartLabel)
  const periodHistory = period === 0 ? history : history.filter((session) => {
    const day = dateKey(session.endedAt)
    return day >= chart[0].date && day <= chart[chart.length - 1].date
  })
  const filtered = periodHistory.filter(isLessonPaceSession).map(lessonPaceObservation)
  const activity = periodHistory.filter(({ mode }) => isPracticeActivityMode(mode))
  const ordinaryEvidence = periodHistory.filter(({ mode }) => isPracticePaceMode(mode))
  const summary = aggregate(filtered)
  const activeMs = activity.reduce((sum, session) => sum + session.activeMs, 0)
  const hasAccuracy = filtered.some((session) => session.totalKeys > 0)
  const trend = speedTrend(filtered)
  const trendReady = trend.ready
  const rising = trend.wpmPerWeek > 0.5
  const falling = trend.wpmPerWeek < -0.5
  const weeklyComparison = weeklySpeedComparison(lessonPace, t)
  const keys = weakKeys(ordinaryEvidence, 10)
  const recent = [...periodHistory].sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt)).slice(0, 12)
  const confusions = Object.entries(ordinaryEvidence.reduce<Record<string, number>>((all, session) => {
    for (const [key, count] of Object.entries(session.confusions || {})) {
      const [expected, actual] = key.split('->')
      if (expected && actual && expected !== actual) all[key] = (all[key] || 0) + count
    }
    return all
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const pace = summary.wpm
  const nextGoal = [20, 30, 40, 50, 60, 80].find((goal) => goal > pace)
  const forecastWeeks = nextGoal && trendReady && rising ? Math.max(1, Math.ceil((nextGoal - pace) / trend.wpmPerWeek)) : null

  const doExport = async (format: 'json' | 'csv') => {
    setExporting(true)
    try {
      const content = format === 'json' ? JSON.stringify({ schema: 'klavish.export.v1', exportedAt: new Date().toISOString(), state }, null, 2) : sessionsToCsv(state.sessions)
      const path = await exportFile(format, content)
      if (path) toast.success(format === 'json' ? t("JSON экспортирован") : t("CSV экспортирован"), { description: path })
    } catch (error) { toast.error(t("Не удалось экспортировать данные"), { description: String(error) }) }
    finally { setExporting(false) }
  }

  return (
    <div className="page stats-page">
      <header className="page-header"><div><span className="section-tag">{t("Данные вместо догадок")}</span><h1>{t("Как растёт ваш навык")}</h1><p>{t("Темп и точность считаются по завершённым урокам обеих раскладок. Время практики учитывает и другие упражнения.")}</p></div><div className="segmented" aria-label={t("Период статистики")}>{[7, 30, 0].map((value) => <button key={value} className={period === value ? 'selected' : ''} onClick={() => setPeriod(value)}>{value ? t("{days} дней", { days: number(value) }) : t("Всё время")}</button>)}</div></header>

      <BenchmarkProgress sessions={history} defaultLayout={state.settings.layout} />
      <KeyboardProgress state={state} layout={keyboardLayout} />

      <section className="stats-grid">
        <StatCard label={t("Темп уроков")} value={filtered.length ? number(summary.wpm) : '—'} unit={filtered.length ? t('сл/мин') : undefined} icon={Gauge} accent detail={weeklyComparison} />
        <StatCard label={t("Точность уроков")} value={hasAccuracy ? number(summary.accuracy) : '—'} unit={hasAccuracy ? '%' : undefined} icon={Activity} detail={t("{count} правильных знаков", { count: number(summary.correct) })} />
        <StatCard label={t("Практика")} value={number(Math.round(activeMs / 6000) / 10)} unit={t("мин")} icon={Clock3} detail={t("{count} тренировок", { count: number(activity.length) })} />
        <StatCard label={t("Темп роста")} value={trendReady ? signed.format(trend.wpmPerWeek) : '—'} unit={trendReady ? t("сл/мин в неделю") : ''} icon={TrendingUp} detail={t("Дней с замером темпа · {count}", { count: number(trend.samples) })} />
      </section>

      <section className="insight-strip">
        <Lightbulb size={23} />
        <div>
          <strong>{!trendReady ? t("Собираем первые ориентиры") : rising ? t("Скорость растёт") : falling ? t("Темп снизился") : t("Похоже на плато")}</strong>
          <p>{!trendReady
            ? t("Для расчёта нужны завершённые уроки в {days} разных днях. В каждом должно быть минимум {seconds} секунд активного набора и {characters} правильных знаков.", { days: number(TREND_MIN_DAYS), seconds: number(TREND_MIN_ACTIVE_SECONDS), characters: number(TREND_MIN_CORRECT_CHARS) })
            : forecastWeeks ? t("При сохранении темпа ориентир {goal} сл/мин достижим примерно через {weeks} нед. Это оценка, а не обещание.", { goal: number(nextGoal!), weeks: number(forecastWeeks) })
              : rising ? t("Сохраняйте точность и проверьте новый темп на незнакомом тексте.")
                : falling ? t("Снизьте темп и сделайте несколько точных повторов, прежде чем снова ускоряться.")
                  : t("Смените тип текста или снизьте скорость: точные повторы помогают сдвинуть плато.")}</p>
        </div>
      </section>

      <section className="stats-charts">
        <article className="panel chart-panel"><div className="panel-heading"><div><span>{period === 0 ? t("Дни с тренировками") : t("По дням")}</span><h2>{t("Скорость и точность")}</h2></div></div><div className="chart-box tall"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 16, right: 12, left: -20, bottom: 0 }}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-text)', fontSize: 12 }} /><YAxis tickFormatter={number} yAxisId="wpm" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-text)', fontSize: 12 }} /><YAxis yAxisId="accuracy" orientation="right" domain={[0, 100]} hide /><Tooltip formatter={(value, name) => typeof value === 'number' ? (name === t('Точность %') ? percent(value) : number(value)) : value} contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', borderRadius: 12 }} /><Line yAxisId="wpm" type="monotone" dataKey="wpm" name={t("Сл/мин")} stroke="var(--lime)" strokeWidth={2.5} dot={{ r: 3 }} /><Line yAxisId="accuracy" type="monotone" dataKey="accuracy" name={t("Точность %")} stroke="var(--cyan)" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="lime" />{t('Сл/мин')}</span><span><i className="cyan" />{t('Точность')}</span></div></article>
        <article className="panel chart-panel"><div className="panel-heading"><div><span>{t("Активное время")}</span><h2>{t("Минуты практики")}</h2></div></div><div className="chart-box tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={activityChart} margin={{ top: 16, right: 8, left: -24, bottom: 0 }}><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-text)', fontSize: 12 }} /><YAxis tickFormatter={number} axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-text)', fontSize: 12 }} /><Tooltip formatter={(value) => typeof value === 'number' ? number(value) : value} contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', borderRadius: 12 }} cursor={{ fill: 'var(--surface-raised)' }} /><Bar dataKey="minutes" name={t("Минуты")} fill="var(--cyan)" radius={[5, 5, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></div></article>
      </section>

      <section className="dashboard-grid lower-grid">
        <article className="panel"><div className="panel-heading"><div><span>{t("Точность + задержка")}</span><h2>{t("Карта слабых клавиш")}</h2></div></div>{keys.length ? <div className="table-scroll"><table><thead><tr><th>{t("Клавиша")}</th><th>{t("Попытки")}</th><th>{t("Ошибки")}</th><th>{t("Задержка")}</th></tr></thead><tbody>{keys.map((item) => <tr key={item.key}><td><kbd className="table-key">{t(displayKey(item.key))}</kbd></td><td>{number(item.attempts)}</td><td className={item.errorRate > 8 ? 'negative' : ''}>{percent(item.errorRate)}</td><td>{number(item.latencyMs)} {t('мс')}</td></tr>)}</tbody></table></div> : <div className="empty-inline"><p>{t("Здесь появятся клавиши, для которых накопилось достаточно попыток и были ошибки.")}</p></div>}</article>
        <article className="panel"><div className="panel-heading"><div><span>{t("Ожидалось → нажато")}</span><h2>{t("Частые перепутанные клавиши")}</h2></div></div>{confusions.length ? <div className="confusion-list">{confusions.map(([pair, count]) => { const [expected, actual] = pair.split('->'); return <div key={pair}><kbd>{t(displayKey(expected))}</kbd><ArrowDownRight size={16} /><kbd className="wrong">{t(displayKey(actual))}</kbd><span>{t("{count} раз", { count: number(count) })}</span></div> })}</div> : <div className="empty-inline"><p>{t("Ошибок пока нет — или данных ещё недостаточно.")}</p></div>}</article>
      </section>

      <section className="panel export-panel"><div><span className="section-tag"><Braces size={15} />{t("Открытые данные")}</span><h2>{t("Логи и внешний анализ")}</h2><p>{t("JSON содержит все метрики и поклавишную статистику. CSV удобен для Excel. В desktop-версии каждая тренировка также добавляется в JSONL-журнал.")}</p>{info?.logDirectory && <code className="log-path">{info.logDirectory}</code>}</div><div className="export-actions"><button className="button secondary" disabled={exporting} onClick={() => void doExport('json')}><FileJson size={17} />{t("Экспорт JSON")}</button><button className="button secondary" disabled={exporting} onClick={() => void doExport('csv')}><Download size={17} />{t("Экспорт CSV")}</button>{info?.isDesktop && <button className="button ghost" onClick={() => void openLogs()}><FolderOpen size={17} />{t("Папка логов")}</button>}</div></section>

      <section className="panel recent-panel">
        <div className="panel-heading"><div><span>{t("Детализация")}</span><h2>{t("Тренировки за период")}</h2></div></div>
        {recent.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>{t("Режим")}</th><th>{t("Дата и время")}</th><th>{t("Скорость")}</th><th>{t("Точность")}</th><th>{t("Активно")}</th><th>{t("Ошибки")}</th><th>p95</th></tr></thead>
              <tbody>{recent.map((session) => {
                const modeLabel = sessionLabel(session.mode)
                const label = t(modeLabel)
                const comparePace = isLessonPaceSession(session) && summary.activeMs > 0
                return (
                  <tr key={session.id}>
                    <td><strong>{session.lessonTitle ? t(session.lessonTitle) : label}</strong>{session.lessonTitle && session.lessonTitle !== modeLabel && <small className="table-subtitle">{label}</small>}</td>
                    <td>{new Date(session.endedAt).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td><span className="metric-with-trend">{hasTextPace(session.mode) ? number(session.wpm) : '—'}{comparePace && (session.wpm >= summary.wpm ? <ArrowUpRight size={14} className="positive" /> : <ArrowDownRight size={14} className="negative" />)}</span></td>
                    <td>{session.totalKeys > 0 ? percent(session.accuracy) : '—'}</td>
                    <td>{number(Math.round(session.activeMs / 6000) / 10)} {t('мин')}</td>
                    <td>{number(session.errors)}</td>
                    <td>{number(session.p95LatencyMs)} {t('мс')}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        ) : <div className="empty-state"><Activity size={28} /><h3>{t("За этот период тренировок нет")}</h3><p>{t("Выберите другой период или начните новый урок.")}</p></div>}
      </section>
    </div>
  )
}
