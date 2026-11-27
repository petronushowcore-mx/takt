import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Clock3, RotateCcw, Sparkles, Target, X } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PracticeHints } from '@/components/PracticeHints'
import { TypingText } from '@/components/TypingText'
import { generateAdaptiveText, lessonDifficulty, lessons, lessonsFor } from '@/data/lessons'
import { generateConfusionDrill, generateLessonStages, getAssessmentText, lessonTextAllowance } from '@/data/practiceTexts'
import { useAppState } from '@/hooks/useAppState'
import { useTypingEngine } from '@/hooks/useTypingEngine'
import { useI18n } from '@/lib/i18n'
import { generateHardcore } from '@/lib/keyboardProgress'
import { acceptsAssessment, ASSESSMENT_MS, assessmentWeekKey, benchmarkForWeek, dueReviewPairs, isAssessment, isCourseLessonAvailable, knownKeys, nextCourseLesson, placementLevel, rankedPairs, reviewKeysForResult } from '@/lib/learning'
import { compareTransitionAttempt, generateTransitionDrill, TRANSITION_MIN_SAMPLES, transitionOverview } from '@/lib/transitions'
import type { AppState, KeyPair, Layout, Lesson, LetterTransition, SessionMode, SessionResult } from '@/types'

type PracticeMode = Exclude<SessionMode, 'orbit' | 'sprint' | 'transfer-practice' | 'transfer-control' | 'layout-switch'>
type Stages = ReturnType<typeof generateLessonStages>

interface Exercise {
  text: string
  title: string
  detail?: string
  detailKeys?: string
  stages?: Stages
  assessment?: { id: string; durationMs: number; week?: string }
  reviewPairs?: KeyPair[]
  transitionPairs?: LetterTransition[]
  transitionEmpty?: 'insufficient' | 'none'
  textAllowance?: number
}

const practiceModes = new Set(['adaptive', 'precision', 'review', 'diagnostic', 'benchmark', 'transition', 'hardcore'])
const stageLabels = { fingers: 'Движения пальцев', words: 'Слова', transfer: 'Связный текст' }

function makeExercise(state: AppState, layout: Layout, mode: PracticeMode, lesson?: Lesson, source?: string): Exercise | undefined {
  const length = state.settings.lessonLength
  if (lesson || mode === 'precision') {
    const selected = lesson ?? nextCourseLesson(state, layout)
    const prior = lesson && lessonsFor(layout)[lesson.level - 2]
    const textAllowance = lesson && prior
      ? lessonTextAllowance(lessonDifficulty(lesson, state).targetWpm, lessonDifficulty(prior, state).targetWpm)
      : undefined
    const stages = generateLessonStages(selected, length, Date.now(), textAllowance)
    return {
      text: stages.map((stage) => stage.text).join(' '), stages, textAllowance,
      title: lesson ? lesson.title : 'Спокойная тренировка',
      detail: lesson ? lesson.subtitle : 'Отработай движения в своём темпе.',
    }
  }
  if (mode === 'diagnostic' || mode === 'benchmark') {
    const assessment = getAssessmentText(layout, mode)
    if (mode === 'benchmark' && benchmarkForWeek(state, layout, assessment.week)) return undefined
    return {
      text: assessment.text,
      title: mode === 'diagnostic' ? 'Входная диагностика' : 'Контроль недели',
      detail: '45 секунд. Печатай в привычном темпе.',
      assessment: { id: assessment.id, week: assessment.week, durationMs: ASSESSMENT_MS },
    }
  }
  if (mode === 'review') {
    const origin = source ? state.sessions.find((session) => session.id === source && session.layout === layout) : undefined
    const keys = origin ? reviewKeysForResult(state, origin) : knownKeys(state, layout)
    const pairs = source ? (origin ? rankedPairs(origin, keys).slice(0, 3) : []) : dueReviewPairs(state, layout)
    const drill = generateConfusionDrill(layout, keys, pairs, length)
    return drill ? { text: drill.text, title: 'Тренировка сочетаний', detail: drill.pairs.map((pair) => pair.expected + ' → ' + pair.actual).join(', '), reviewPairs: drill.pairs } : undefined
  }
  if (mode === 'transition') {
    const keys = knownKeys(state, layout)
    const { baselineReady, slow } = transitionOverview(state.sessions, layout)
    const pairs = slow.filter((pair) => keys.has(pair.from) && keys.has(pair.to)).slice(0, 3)
    const drill = generateTransitionDrill(layout, keys, pairs, length)
    return drill ? {
      text: drill.text, title: 'Переходы между буквами',
      detail: drill.pairs.map(({ from, to }) => from + to).join(', '),
      transitionPairs: drill.pairs,
    } : { text: '', title: 'Переходы между буквами', detail: '', transitionEmpty: baselineReady ? 'none' : 'insufficient' }
  }
  if (mode === 'hardcore') {
    const challenge = generateHardcore(state.sessions, layout, Date.now())
    return challenge && {
      text: challenge.text,
      title: 'Хардкор',
      detail: 'Фокус · {keys}. В каждой группе один знак для смены движения.',
      detailKeys: challenge.targets.join(' · '),
    }
  }
  const adaptive = generateAdaptiveText(layout, state.sessions, length, nextCourseLesson(state, layout).level)
  return { text: adaptive.text, title: 'Адаптивная тренировка',
    detail: adaptive.keys.length ? 'Фокус · {keys}' : adaptive.difficulty, detailKeys: adaptive.keys.join(', ') }
}

function playErrorTone() {
  try {
    const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const context = new Audio()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 150
    gain.gain.setValueAtTime(0.035, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.08)
    oscillator.onended = () => void context.close()
  } catch { /* Sound is optional. */ }
}

export default function Practice() {
  const { t } = useI18n()
  const { lessonId = 'adaptive' } = useParams()
  const [params] = useSearchParams()
  const { state } = useAppState()
  const lesson = lessons.find((item) => item.id === lessonId)
  const requestedLayout = params.get('layout')
  const layout = lesson?.layout ?? (requestedLayout === 'ru' || requestedLayout === 'en' ? requestedLayout : state.settings.layout)
  const source = params.get('source') ?? undefined
  if (lesson ? !isCourseLessonAvailable(lesson, state) : !practiceModes.has(lessonId)) {
    return <div className="page"><div className="empty-state"><h1>{t(lesson ? 'Урок пока закрыт' : 'Урок не найден')}</h1><Link className="button primary" to="/lessons">{t('Вернуться к урокам')}</Link></div></div>
  }
  const mode: PracticeMode = lesson ? 'lesson' : lessonId as PracticeMode
  return <PracticeSession key={[lessonId, layout, source].join(':')} layout={layout} mode={mode} lesson={lesson} source={source} />
}

function PracticeSession({ layout, mode, lesson, source }: { layout: Layout; mode: PracticeMode; lesson?: Lesson; source?: string }) {
  const { t, locale } = useI18n()
  const formatMetric = useMemo(() => locale.startsWith('ru') ? String : new Intl.NumberFormat(locale, { maximumFractionDigits: 1, useGrouping: false }).format, [locale])
  const navigate = useNavigate()
  const { state, recordSession } = useAppState()
  const [wasPassed] = useState(() => Boolean(lesson && state.lessonProgress[lesson.id]?.completed))
  const targetWpm = lesson ? lessonDifficulty(lesson, state).targetWpm : undefined
  const [exercise, setExercise] = useState(() => makeExercise(state, layout, mode, lesson, source))
  const [generation, setGeneration] = useState(0)
  const [savedResult, setSavedResult] = useState<SessionResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [weekChanged, setWeekChanged] = useState(false)
  const previousErrors = useRef(0)
  const typingStage = useRef<HTMLElement>(null)
  const text = exercise?.text ?? ''
  const controlled = isAssessment(mode)
  const quiet = mode === 'precision' || mode === 'review' || mode === 'transition' || mode === 'hardcore'
  const statsPath = '/stats?layout=' + layout
  const lessonsPath = '/lessons?layout=' + layout

  useEffect(() => { typingStage.current?.focus({ preventScroll: true }) }, [])

  const onComplete = useCallback(async (session: SessionResult) => {
    if (isAssessment(session.mode) && !acceptsAssessment(session)) return
    setSaving(true)
    setSaveFailed(false)
    try {
      const unlocked = await recordSession(session)
      setSavedResult(session)
      unlocked.forEach((achievement) => toast.success(t('Достижение: {name}', { name: t(achievement.title) })))
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }, [recordSession, t])

  const beforeStart = useCallback((at: number) => {
    if (mode !== 'benchmark') return true
    if (exercise?.assessment?.week === assessmentWeekKey(new Date(at))) {
      setWeekChanged(false)
      return true
    }
    setExercise(makeExercise(state, layout, mode, lesson, source))
    setGeneration((value) => value + 1)
    setWeekChanged(true)
    return false
  }, [exercise?.assessment?.week, layout, lesson, mode, source, state])

  const scoreFrom = lesson && exercise?.stages ? exercise.stages[0].text.length + 1 : undefined
  const engine = useTypingEngine({ text, mode, layout, lesson, targetWpm, scoreFrom, assessment: exercise?.assessment,
    reviewPairs: exercise?.reviewPairs, transitionPairs: exercise?.transitionPairs, beforeStart, onComplete })

  useEffect(() => {
    if (!controlled && state.settings.sound && engine.snapshot.errors > previousErrors.current) playErrorTone()
    previousErrors.current = engine.snapshot.errors
  }, [controlled, engine.snapshot.errors, state.settings.sound])

  if (!exercise || !text) {
    if (mode === 'hardcore') return <div className="page"><div className="empty-state">
      <h1>{t('Хардкор')}</h1>
      <p>{t('Режим собирает самые трудные символы для этой раскладки. Нужна хотя бы одна ошибка на символе с четырьмя или более попытками в обычном наборе.')}</p>
      <Link className="button primary" to={lessonsPath}>{t('К урокам')}</Link>
      <Link className="button secondary" to={statsPath}>{t('К статистике клавиатуры')}</Link>
    </div></div>
    const benchmark = mode === 'benchmark'
    const transitionNone = exercise?.transitionEmpty === 'none'
    const transitionTitle = transitionNone ? 'Медленные переходы не выделяются' : 'Пока мало замеров переходов'
    return <div className="page"><div className="empty-state">
      <h1>{t(benchmark ? 'Результат этой недели уже сохранён' : mode === 'transition' ? transitionTitle : 'Сочетаний для повтора пока нет')}</h1>
      {mode === 'transition' && <p>{t(transitionNone
        ? 'Задержки измеренных переходов среди знакомых букв укладываются в ваш обычный ритм.'
        : 'Для подбора упражнения нужны несколько обычных тренировок с замерами разных переходов.')}</p>}
      <Link className="button primary" to={benchmark ? statsPath : lessonsPath}>{t(benchmark ? 'К прогрессу' : 'К урокам')}</Link>
    </div></div>
  }

  const progress = controlled
    ? Math.min(100, Math.round(100 * engine.elapsedMs / ASSESSMENT_MS))
    : Math.round(100 * engine.snapshot.cursor / text.length)
  const next = lesson ? lessonsFor(layout)[lesson.level] : undefined
  const passed = Boolean(savedResult?.completedText && lesson && targetWpm !== undefined && savedResult.accuracy >= lesson.minAccuracy && savedResult.wpm >= targetWpm)
  const nextDifficulty = passed && next ? lessonDifficulty(next, state) : undefined
  const invalidAssessment = controlled && Boolean(engine.result && !acceptsAssessment(engine.result))
  const pairs = savedResult && !controlled ? rankedPairs(savedResult, reviewKeysForResult(state, savedResult)).slice(0, 3) : []
  const needsFollowUp = pairs.length > 0 && mode !== 'review' && mode !== 'transition' && mode !== 'hardcore'
  const transitionResult = savedResult && exercise.transitionPairs
    ? compareTransitionAttempt(state.sessions, savedResult, exercise.transitionPairs) : []
  const stageIndex = exercise.stages?.findIndex((_, index, stages) =>
    engine.snapshot.cursor < stages.slice(0, index + 1).reduce((end, stage) => end + stage.text.length + 1, 0),
  ) ?? -1
  const activeStage = exercise.stages?.[stageIndex]
  const exerciseDetail = t(exercise.detail ?? '', { keys: exercise.detailKeys ?? '' })
  const detail = lesson
    ? t('{detail} · Цель {wpm} сл/мин и {accuracy}%', { detail: exerciseDetail, wpm: formatMetric(targetWpm ?? 0), accuracy: formatMetric(lesson.minAccuracy) })
    : exerciseDetail
  const diagnosticLevel = mode === 'diagnostic' && savedResult ? placementLevel(state, layout) : 1
  const diagnosticLesson = mode === 'diagnostic' ? lessonsFor(layout)[diagnosticLevel - 1] : undefined
  const destination = mode === 'benchmark' || mode === 'hardcore' ? statsPath : lessonsPath
  const resultTitle = lesson ? (passed ? 'Урок пройден!' : 'Хорошая попытка') : controlled ? 'Результат сохранён' : 'Тренировка сохранена'
  let resultDetail = t('Следующий текст учтёт эти результаты.')
  if (mode === 'diagnostic') resultDetail = t('Текущий старт курса · урок {lesson}.', { lesson: diagnosticLevel })
  else if (mode === 'benchmark') resultDetail = t('Результат добавлен к замерам этой раскладки.')
  else if (mode === 'review') resultDetail = t('Даты следующих повторов учтут точность в этом упражнении.')
  else if (mode === 'precision') resultDetail = t('Точность добавлена в историю тренировок.')
  else if (mode === 'hardcore') resultDetail = t('Промахи по каждому символу видны в колонке «Хардкор» на экране прогресса.')
  else if (mode === 'transition') resultDetail = t('Задержка считается по точным соседним нажатиям. Длинные паузы пропускаются.')
  else if (lesson) {
    if (nextDifficulty) resultDetail = t('Следующая цель — {wpm} сл/мин{increase}. {result}', {
      wpm: formatMetric(nextDifficulty.targetWpm),
      increase: nextDifficulty.increasePercent ? ' (+' + nextDifficulty.increasePercent + '%)' : '',
      result: wasPassed ? t('Ранее назначенная цель сохранена.') :
        t('Результат этого урока — {wpm} сл/мин и {accuracy}% точности.', { wpm: formatMetric(savedResult?.wpm ?? 0), accuracy: formatMetric(savedResult?.accuracy ?? 0) }),
    })
    else if (passed) resultDetail = t('Целевые скорость и точность достигнуты.')
    else if (!savedResult?.completedText) resultDetail = t('Попытка сохранена. Для перехода наберите весь текст.')
    else if (savedResult) {
      const remaining = []
      if (targetWpm !== undefined && savedResult.wpm < targetWpm) remaining.push(t('темп {wpm} из {target} сл/мин', { wpm: formatMetric(savedResult.wpm), target: formatMetric(targetWpm) }))
      if (savedResult.accuracy < lesson.minAccuracy) remaining.push(t('точность {accuracy} из {target}%', { accuracy: formatMetric(savedResult.accuracy), target: formatMetric(lesson.minAccuracy) }))
      resultDetail = t('Для перехода подтяните {metrics}.', { metrics: remaining.join(t(' и ')) })
    }
  }

  const retry = () => {
    setSavedResult(null)
    setSaveFailed(false)
    setWeekChanged(false)
    setExercise(makeExercise(state, layout, mode, lesson, source))
    setGeneration((value) => value + 1)
    engine.restart()
    requestAnimationFrame(() => typingStage.current?.focus({ preventScroll: true }))
  }

  return (
    <div className="practice-page">
      <header className="practice-header">
        <Link to={destination} className="icon-button" aria-label={t('Выйти из тренировки')}><ArrowLeft size={20} /></Link>
        <div><span>{lesson ? t('Урок {level} · {layout}', { level: lesson.level, layout: layout.toUpperCase() }) : layout.toUpperCase()}</span><h1>{t(exercise.title)}</h1><p>{detail}</p></div>
        <div className="practice-controls">
          {!(mode === 'benchmark' && savedResult) && <button className="button ghost" onClick={retry} disabled={saving || saveFailed}><RotateCcw size={17} />{t('Заново')}</button>}
          {saveFailed && engine.result
            ? <button className="button ghost" onClick={() => { if (engine.result) void onComplete(engine.result) }}>{t('Повторить сохранение')}</button>
            : !controlled && <button className="button ghost" disabled={saving || Boolean(engine.result)} onClick={() => {
              if (!engine.finish()) toast.info(t('Наберите хотя бы 5 правильных знаков, чтобы сохранить попытку'))
            }}>{t('Завершить')}</button>}
        </div>
      </header>
      {lesson && <p className="saving-label">
        {t(exercise.textAllowance === 0 ? 'Потренируй новые знаки и Shift в разминке. Цель по темпу и точности относится к знакомым нажатиям со второго этапа.' :
          'Начни с новых клавиш в своём темпе. Цель по темпу и точности действует со второго этапа.')}
      </p>}
      {saving && <p className="saving-label" role="status">{t('Сохраняем результат…')}</p>}
      {saveFailed && <p className="error-feedback" role="alert">{t('Результат пока не сохранён. Повторите сохранение.')}</p>}
      {weekChanged && <p className="start-hint" role="status">{t('Началась новая неделя. Начните с первого знака нового текста.')}</p>}
      {invalidAssessment && <p className="error-feedback" role="status">{t('Для замера нужно набрать хотя бы 5 знаков за 45 секунд. Начни новый тест, когда будешь готов.')}</p>}
      <div className="practice-progress"><i style={{ width: progress + '%' }} /></div>

      <section className="practice-live-stats" aria-label={t('Показатели тренировки')}>
        {controlled && <div><span>{t('Осталось')}</span><strong>{Math.max(0, Math.ceil((ASSESSMENT_MS - engine.elapsedMs) / 1000))}<small>{t('сек')}</small></strong></div>}
        {!quiet && !controlled && <div><span>{t('Скорость')}</span><strong>{formatMetric(engine.liveWpm)}<small>{t('сл/мин')}</small></strong></div>}
        <div><span>{t('Точность')}</span><strong>{formatMetric(engine.liveAccuracy)}<small>%</small></strong></div>
        <div><span>{t('Серия без ошибок')}</span><strong>{engine.snapshot.streak}<small>{t('знаков')}</small></strong></div>
        <div><span>{t('Ошибки')}</span><strong>{engine.snapshot.errors}</strong></div>
      </section>

      <section ref={typingStage} className={'typing-stage ' + (engine.snapshot.started ? 'started' : '')} tabIndex={0} aria-label={t('Область набора. Просто начните печатать')}>
        {activeStage ? <div className="start-hint"><Sparkles size={17} /><span>{t('Этап {step} из {count} · {stage}', { step: stageIndex + 1, count: exercise.stages?.length ?? 0, stage: t(stageLabels[activeStage.kind]) })}</span></div>
          : !engine.snapshot.started && <div className="start-hint"><Sparkles size={17} />{t(quiet ? 'Начни с первого выделенного знака' : 'Начните печатать — время запустится с первой клавиши')}</div>}
        <TypingText text={text} layout={layout} cursor={engine.snapshot.cursor} errorPositions={engine.errorPositions} lastError={engine.snapshot.lastError} />
        {engine.snapshot.lastError && <div className="error-feedback"><X size={16} />{t('Нажато «{key}» — нужен выделенный знак', { key: engine.snapshot.lastError.actual === ' ' ? t('пробел') : engine.snapshot.lastError.actual })}</div>}
      </section>

      <PracticeHints key={generation} layout={layout} expected={text[engine.snapshot.cursor] ?? ''} position={engine.snapshot.cursor}
        pressed={engine.snapshot.lastPressed} lessonProgress={state.lessonProgress} active={!engine.result}
        guided={quiet} showKeyboard={!controlled && state.settings.showKeyboard} />

      <Dialog open={Boolean(savedResult)} onOpenChange={(open) => { if (!open) navigate(destination) }}>
        <DialogContent className="result-dialog" showCloseButton={false}>
          <DialogHeader>
            <div className={'result-mark ' + (passed || !lesson ? 'success' : '')}>{passed || !lesson ? <Check size={30} /> : <Target size={30} />}</div>
            <DialogTitle>{t(resultTitle)}</DialogTitle>
            <DialogDescription>{resultDetail}</DialogDescription>
          </DialogHeader>
          {savedResult && <div className="result-stats">
            {!quiet && <div><strong>{formatMetric(savedResult.wpm)}</strong><span>{t('слов в минуту')}</span></div>}
            <div><strong>{formatMetric(savedResult.accuracy)}%</strong><span>{t('точность')}</span></div>
            <div><strong>{savedResult.bestStreak}</strong><span>{t('лучшая серия')}</span></div>
            <div><strong>{formatMetric(Math.round(savedResult.activeMs / 6000) / 10)}</strong><span>{t('минут практики')}</span></div>
          </div>}
          <div className="result-insight"><Clock3 size={17} /><span>{savedResult?.errors ? t('{errors} ошибок', { errors: savedResult.errors }) : t('Без ошибок — отличный контроль движений.')}</span></div>
          {needsFollowUp && <div className="result-insight"><span>{t('Перепутанные клавиши · {pairs}', { pairs: pairs.map((pair) => pair.expected + ' → ' + pair.actual + ' (' + pair.count + ')').join(', ') })}</span></div>}
          {mode === 'transition' && (transitionResult.length ? <>
            <ul className="transition-result">
              {transitionResult.map((item) => <li key={item.from + item.to}>
                <strong>{item.from}{item.to}</strong>{t(' · это упражнение {latency} мс, {samples} замеров', { latency: item.medianMs, samples: item.samples })}
                {item.previousMedianMs !== undefined && <span>{t(item.previousSource === 'drill' ? ' · прошлое упражнение {latency} мс' : ' · обычные тексты {latency} мс', { latency: item.previousMedianMs })}</span>}
              </li>)}
            </ul>
            {transitionResult.some(({ previousSource }) => previousSource === 'practice') &&
              <p className="result-insight">{t('Замеры в обычных текстах и в упражнении получены в разных заданиях.')}</p>}
            {transitionResult.length < (exercise.transitionPairs?.length ?? 0) &&
              <p className="result-insight">{t('Для остальных пар нужно по {count} точных переходов.', { count: TRANSITION_MIN_SAMPLES })}</p>}
          </> : <p className="result-insight">{t('Для замера нужно {count} точных переходов по одной паре.', { count: TRANSITION_MIN_SAMPLES })}</p>)}
          <div className="dialog-actions">
            {needsFollowUp && <Link className="button secondary" to={'/practice/review?layout=' + layout + '&source=' + encodeURIComponent(savedResult!.id)}>{t('Потренировать ошибки')}</Link>}
            {lesson && !passed && !needsFollowUp && <Link className="button secondary" to={'/practice/precision?layout=' + layout}>{t('Спокойная тренировка')}</Link>}
            {!controlled && <button className="button ghost" onClick={retry}><RotateCcw size={17} />{t(lesson ? 'Ещё раз' : 'Новый текст')}</button>}
            {passed && next
              ? <button className="button primary" onClick={() => navigate('/practice/' + next.id)}>{t('Следующий урок')} <ArrowRight size={18} /></button>
              : diagnosticLesson
                ? <Link className="button primary" to={'/practice/' + nextCourseLesson(state, layout).id}>{t('К своему уроку')} <ArrowRight size={18} /></Link>
                : <button className="button primary" onClick={() => navigate(destination)}>{t(mode === 'benchmark' || mode === 'hardcore' ? 'К прогрессу' : 'К урокам')} <ArrowRight size={18} /></button>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
