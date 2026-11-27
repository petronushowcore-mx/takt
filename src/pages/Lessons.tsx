import { ArrowRight, BrainCircuit, Check, Crosshair, LockKeyhole, MoveRight, RotateCcw, Target } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useAppState } from '@/hooks/useAppState'
import { lessonDifficulty, lessonsFor } from '@/data/lessons'
import { dueReviewItems, isCourseLessonAvailable, knownKeys, placementLevel } from '@/lib/learning'
import { displayKey } from '@/lib/metrics'
import { slowTransitions } from '@/lib/transitions'
import type { Layout } from '@/types'
import { useI18n } from '@/lib/i18n'

const reviewLabels = {
  new: 'первый повтор',
  building: 'закрепляем',
  stable: 'закрепилось',
  forgotten: 'снова требует внимания',
  insufficient: 'пока мало данных',
}

export default function Lessons() {
  const { t, locale } = useI18n()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const { state, updateSettings } = useAppState()
  const [params, setParams] = useSearchParams()
  const requested = params.get('layout')
  const layout = requested === 'ru' || requested === 'en' ? requested : state.settings.layout
  const values = lessonsFor(layout)
  const completed = values.filter((lesson) => state.lessonProgress[lesson.id]?.completed).length
  const placement = placementLevel(state, layout)
  const review = dueReviewItems(state, layout)
  const keys = knownKeys(state, layout)
  const transitions = slowTransitions(state.sessions, layout, Infinity)
    .filter(({ from, to }) => keys.has(from) && keys.has(to))
    .slice(0, 3)
  const selectLayout = (value: Layout) => { setParams({ layout: value }, { replace: true }); void updateSettings({ layout: value }) }
  return (
    <div className="page lessons-page">
      <header className="page-header">
        <div><span className="section-tag">{t("Персональная программа")}</span><h1>{t("От опорного ряда к свободному набору")}</h1><p>{t("Завершите весь текст с точностью от 94% и достигните цели по темпу. Следующая цель вырастет на 5–15% по результату.")}</p></div>
        <div className="segmented" aria-label={t('Раскладка клавиатуры')}><button aria-pressed={layout === 'ru'} className={layout === 'ru' ? 'selected' : ''} onClick={() => selectLayout('ru')}>{t("Русская")}</button><button aria-pressed={layout === 'en'} className={layout === 'en' ? 'selected' : ''} onClick={() => selectLayout('en')}>{t("English")}</button></div>
      </header>

      <Link to={`/practice/adaptive?layout=${layout}`} className="adaptive-banner">
        <span className="adaptive-icon"><BrainCircuit size={28} /></span>
        <div><h2>{t("Адаптивная тренировка")}</h2><p>{t("Текст подбирается по клавишам, на которых ты ошибаешься.")}</p></div>
        <span className="button primary">{t('Подобрать текст')} <ArrowRight size={18} /></span>
      </Link>

      <nav className="learning-actions" aria-label={t('Дополнительные упражнения')}>
        {completed === 0 && <Link className="button secondary" to={`/practice/diagnostic?layout=${layout}`}><Target size={17} />{t('Входная диагностика')}</Link>}
        <Link className="button secondary" to={`/practice/precision?layout=${layout}`}><Crosshair size={17} />{t('Спокойная тренировка')}</Link>
        <Link className="button secondary" to={`/practice/transition?layout=${layout}`}><MoveRight size={17} aria-hidden="true" />{t('Переходы между буквами')}</Link>
        <Link className="button secondary" to={`/practice/hardcore?layout=${layout}`}>{t("Хардкор")}</Link>
        {review.length > 0 && <Link className="button secondary" to={`/practice/review?layout=${layout}`}><RotateCcw size={17} />{t('Повторить сегодня ({count})', { count: review.length })}</Link>}
      </nav>
      {(transitions.length > 0 || review.length > 0) && (
        <div className="dashboard-grid">
          {transitions.length > 0 && (
            <section className="panel" aria-labelledby="course-transitions">
              <div className="panel-heading"><h2 id="course-transitions">{t("Медленные переходы")}</h2></div>
              <div className="confusion-list">
                {transitions.map(({ from, to, medianMs, samples }) => (
                  <div key={`${from}>${to}`}><kbd>{t(displayKey(from))}</kbd><ArrowRight size={15} aria-hidden="true" /><kbd>{t(displayKey(to))}</kbd><span>{t('Медиана {ms} мс · {count} замеров', { ms: Math.round(medianMs), count: samples })}</span></div>
                ))}
              </div>
            </section>
          )}
          {review.length > 0 && (
            <section className="panel" aria-labelledby="course-review">
              <div className="panel-heading"><h2 id="course-review">{t("Пары к повторению")}</h2></div>
              <div className="confusion-list">
                {review.map(({ expected, actual, intervalMs, status }) => {
                  const interval = intervalMs < 86_400_000
                    ? t('{value} ч', { value: Math.round(intervalMs / 3_600_000) })
                    : t('{value} дн.', { value: number.format(intervalMs / 86_400_000) })
                  return <div key={`${expected}>${actual}`}><kbd>{t(displayKey(expected))}</kbd><ArrowRight size={15} aria-hidden="true" /><kbd className="wrong">{t(displayKey(actual))}</kbd><span>{t(reviewLabels[status])} · {interval}</span></div>
                })}
              </div>
            </section>
          )}
        </div>
      )}
      {placement > 1 && <p className="course-placement">{t('По диагностике курс начинается с урока {number}. Предыдущие упражнения доступны для повторения.', { number: placement })}</p>}

      <div className="course-progress"><div><strong>{t('{completed} из {total}', { completed, total: values.length })}</strong><span>{t("уроков завершено")}</span></div><div className="progress-track"><i style={{ width: `${(completed / values.length) * 100}%` }} /></div></div>

      <section className="lesson-grid" aria-label={t('Список уроков')}>
        {values.map((lesson) => {
          const unlocked = isCourseLessonAvailable(lesson, state)
          const progress = state.lessonProgress[lesson.id]
          const difficulty = unlocked ? lessonDifficulty(lesson, state) : undefined
          const content = (
            <>
              <div className="lesson-card-top"><span className="lesson-index">{String(lesson.level).padStart(2, '0')}</span>{progress?.completed ? <span className="status success"><Check size={14} />{t('Пройден')}</span> : unlocked ? <span className="status">{t("Доступен")}</span> : <LockKeyhole size={17} />}</div>
              <div className="lesson-card-copy"><span>{lesson.keys}</span><h2>{t(lesson.title)}</h2><p>{t(lesson.subtitle)}</p></div>
              <div className="lesson-card-footer">{difficulty && <span><Target size={15} />{t('{value} сл/мин', { value: number.format(difficulty.targetWpm) })}{difficulty.increasePercent ? ' · +' + difficulty.increasePercent + '%' : ''}</span>}{progress && progress.bestWpm > 0 ? <span>{t('Лучший: {value}', { value: number.format(progress.bestWpm) })}</span> : null}{unlocked && <ArrowRight size={18} />}</div>
            </>
          )
          return unlocked ? <Link to={`/practice/${lesson.id}`} className={`lesson-card ${progress?.completed ? 'completed' : ''}`} key={lesson.id}>{content}</Link> : <div className="lesson-card locked" aria-label={t('{title}: заблокирован', { title: t(lesson.title) })} key={lesson.id}>{content}</div>
        })}
      </section>
    </div>
  )
}
