import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import { FileText, Keyboard, RotateCcw } from 'lucide-react'
import { TypingText } from '@/components/TypingText'
import { useAppState } from '@/hooks/useAppState'
import { useTypingEngine } from '@/hooks/useTypingEngine'
import { useI18n } from '@/lib/i18n'
import { buildSessionResult, percentile, type KeyEntry } from '@/lib/metrics'
import { createId } from '@/lib/storage'
import {
  decodeTextFile, matchesSwitchCue, MAX_SOURCE_LENGTH, MAX_TEXT_FILE_BYTES, MIN_EXCERPT_LENGTH,
  splitTransferText, summarizeTransfer, SWITCH_COUNT, switchCues, switchMeasurement,
} from '@/lib/trainingLab'
import type { Layout, SessionResult } from '@/types'
import './TrainingLab.css'

type SaveStatus = 'idle' | 'saving' | 'failed' | 'saved'
type TransferStage = 'initial' | 'repeat' | 'control'
type SwitchMeasurements = NonNullable<SessionResult['layoutSwitches']>

const layoutName: Record<Layout, string> = { ru: 'Русская · RU', en: 'English · EN' }
const transferStages = {
  initial: { index: 1, title: 'Практический отрывок', result: 'Первый набор завершён', next: 'Повторить отрывок' },
  repeat: { index: 2, title: 'Повтор того же отрывка', result: 'Повтор завершён', next: 'Начать контроль' },
  control: { index: 3, title: 'Контрольный отрывок', result: 'Контроль завершён', next: 'Посмотреть сравнение' },
}

function useSaveAttempt() {
  const { recordSession } = useAppState()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [result, setResult] = useState<SessionResult | null>(null)
  const inFlight = useRef(false)

  const save = useCallback(async (session: SessionResult) => {
    if (inFlight.current) return
    inFlight.current = true
    setResult(session)
    setStatus('saving')
    try {
      await recordSession(session)
      setStatus('saved')
    } catch {
      setStatus('failed')
    } finally {
      inFlight.current = false
    }
  }, [recordSession])

  const reset = () => {
    setStatus('idle')
    setResult(null)
  }
  return { status, result, save, reset }
}

function SaveNotice({ status, retry }: { status: SaveStatus; retry: () => void }) {
  const { t } = useI18n()
  if (status === 'failed') return <div className="lab-save-notice">
    <p role="alert">{t('Результат пока не сохранён.')}</p>
    <button type="button" className="button secondary" onClick={retry}>{t('Повторить сохранение')}</button>
  </div>
  if (status === 'saving') return <p className="saving-label" role="status">{t('Сохраняем результат…')}</p>
  return status === 'saved' ? <p className="saving-label" role="status">{t('Результат сохранён.')}</p> : null
}

function TransferMetrics({ result, label }: { result: SessionResult; label: string }) {
  const { t, locale } = useI18n()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  return <section className="lab-measurement" aria-label={t(label)}>
    <h3>{t(label)}</h3>
    <dl>
      <div><dt>{t('Темп набора')}</dt><dd>{result.activeMs > 0 ? t('{wpm} сл/мин', { wpm: number.format(result.wpm) }) : '—'}</dd></div>
      <div><dt>{t('Точность с первого нажатия')}</dt><dd>{result.firstPassAccuracy === undefined ? '—' : number.format(result.firstPassAccuracy) + '%'}</dd></div>
      <div><dt>{t('Ошибочных знаков при первом вводе')}</dt><dd>{result.firstPassErrors === undefined ? '—' : result.firstPassErrors}</dd></div>
    </dl>
  </section>
}

function TransferAttempt({ exercise, stage, active, onNext, reset }: {
  exercise: { text: string; runId: string; layout: Layout }
  stage: TransferStage
  active: boolean
  onNext: () => void
  reset: () => void
}) {
  const { t } = useI18n()
  const keyboardTarget = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const attempt = useSaveAttempt()
  const step = transferStages[stage]
  const engine = useTypingEngine({
    text: exercise.text, mode: stage === 'control' ? 'transfer-control' : 'transfer-practice',
    layout: exercise.layout, keyboardTarget,
    onComplete: (result) => { void attempt.save(summarizeTransfer(result, exercise.runId)) },
  })

  useEffect(() => {
    if (active) {
      if (engine.result) heading.current?.focus()
      else keyboardTarget.current?.focus()
    }
  }, [active, engine.result])

  if (attempt.result) return <section className="panel lab-panel" aria-labelledby="transfer-result">
    <h2 id="transfer-result" ref={heading} tabIndex={-1}>{t(step.result)}</h2>
    <TransferMetrics result={attempt.result} label={step.title} />
    <SaveNotice status={attempt.status} retry={() => { if (attempt.result) void attempt.save(attempt.result) }} />
    {attempt.status === 'saved' && <button type="button" className="button primary" onClick={onNext}>{t(step.next)}</button>}
  </section>

  return <section className="panel lab-panel" aria-labelledby="transfer-work">
    <div className="lab-panel-heading">
      <div><p className="lab-caption">{t('Этап {step} из 3 · {layout}', { step: step.index, layout: t(layoutName[exercise.layout]) })}</p><h2 id="transfer-work">{t(step.title)}</h2></div>
      <button type="button" className="button ghost" onClick={reset}><RotateCcw size={16} />{t('Выбрать другой текст')}</button>
    </div>
    <section ref={keyboardTarget} className="typing-stage lab-typing" tabIndex={0} aria-label={t('Поле набора своего текста')}>
      <TypingText text={exercise.text} layout={exercise.layout} cursor={engine.snapshot.cursor} errorPositions={engine.errorPositions} lastError={engine.snapshot.lastError} />
    </section>
    <progress className="lab-progress" value={engine.snapshot.cursor} max={exercise.text.length} aria-label={t('Готовность отрывка')} />
    <p className="lab-caption">{t('{typed} из {total} знаков. Темп будет показан после завершения.', { typed: engine.snapshot.cursor, total: exercise.text.length })}</p>
  </section>
}

type TransferExercise = NonNullable<ReturnType<typeof splitTransferText>> & { runId: string }

function TransferTraining({ active }: { active: boolean }) {
  const { t, locale } = useI18n()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const { state } = useAppState()
  const [source, setSource] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [fileNotice, setFileNotice] = useState('')
  const [problem, setProblem] = useState('')
  const [exercise, setExercise] = useState<TransferExercise | null>(null)
  const [stage, setStage] = useState<TransferStage>('initial')
  const { latestControl, latestPractice, latestRepeat, latestIncomplete } = useMemo(() => {
    const recent = [...state.sessions].reverse()
    const controls = recent.filter((session) => session.mode === 'transfer-control' && session.transferRunId)
    const controlIds = new Set(controls.map((session) => session.transferRunId))
    const latestControl = controls[0]
    const [latestPractice, latestRepeat] = latestControl ? state.sessions.filter((session) =>
      session.mode === 'transfer-practice' && session.transferRunId === latestControl.transferRunId) : []
    const sinceControl = latestControl ? recent.slice(0, recent.indexOf(latestControl)) : recent
    const latestIncomplete = sinceControl.find((session) =>
      session.mode === 'transfer-practice' && session.transferRunId && !controlIds.has(session.transferRunId))
    return { latestControl, latestPractice, latestRepeat, latestIncomplete }
  }, [state.sessions])

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setFileNotice('')
    if (!file.name.toLowerCase().endsWith('.txt') || file.size > MAX_TEXT_FILE_BYTES) {
      setProblem('Выберите текстовый файл .txt размером до 128 КБ.')
      return
    }
    setLoadingFile(true)
    try {
      const text = decodeTextFile(await file.arrayBuffer())
      if (!text.trim()) throw new Error('Пустой файл')
      setSource(text.slice(0, MAX_SOURCE_LENGTH))
      setProblem('')
      setFileNotice(text.length > MAX_SOURCE_LENGTH ? 'Загружены первые {count} знаков.' : 'Текст загружен.')
    } catch {
      setProblem('Не удалось прочитать текст из файла. Проверьте содержимое или вставьте текст вручную.')
    } finally {
      setLoadingFile(false)
    }
  }

  function start(event: FormEvent) {
    event.preventDefault()
    const excerpts = splitTransferText(source)
    if (!excerpts) {
      setProblem('Добавьте два разных отрывка от {count} знаков на одном языке, русском или английском.')
      return
    }
    setExercise({ ...excerpts, runId: createId() })
    setStage('initial')
    setSource('')
    setFileNotice('')
    setProblem('')
  }

  return <div className="lab-content" hidden={!active}>
    {exercise
      ? <TransferAttempt key={exercise.runId + stage} exercise={{
        text: stage === 'control' ? exercise.control : exercise.practice,
        layout: exercise.layout, runId: exercise.runId,
      }} stage={stage} active={active} reset={() => setExercise(null)} onNext={() => {
        if (stage === 'control') setExercise(null)
        else setStage(stage === 'initial' ? 'repeat' : 'control')
      }} />
      : <>
        <section className="panel lab-panel">
          <div className="lab-panel-heading"><div><h2>{t('Свой текст')}</h2><p>{t('Наберите один отрывок дважды, чтобы сравнить темп и точность на том же тексте. Затем появится другой отрывок для отдельного замера.')}</p></div></div>
          <form className="lab-form" onSubmit={start}>
            <label htmlFor="personal-text">{t('Текст для упражнения')}</label>
            <textarea id="personal-text" rows={6} maxLength={MAX_SOURCE_LENGTH} value={source} disabled={loadingFile}
              aria-describedby="personal-text-help" onChange={(event) => {
                setSource(event.target.value)
                setProblem('')
                setFileNotice('')
              }} />
            <p id="personal-text-help" className="lab-caption">{t('Нужны два разных отрывка от {count} знаков на русском или английском. Оформление упрощается под клавиатуру. В историю попадут только результаты.', { count: MIN_EXCERPT_LENGTH })}</p>
            <div className="lab-actions">
              <label className="lab-file"><FileText size={17} />{t('Файл .txt')}
                <input type="file" accept=".txt,text/plain" disabled={loadingFile} onChange={(event) => { void readFile(event) }} />
              </label>
              <button type="submit" className="button primary" disabled={loadingFile || !source.trim()}>{t('Начать практику')}</button>
            </div>
            {fileNotice && <p className="lab-caption" role="status">{t(fileNotice, { count: number.format(MAX_SOURCE_LENGTH) })}</p>}
            {problem && <p className="error-feedback" role="alert">{t(problem, { count: MIN_EXCERPT_LENGTH })}</p>}
          </form>
        </section>
        {latestPractice && latestControl && <section className="panel lab-panel" aria-labelledby="transfer-history">
          <div className="lab-panel-heading"><div><h2 id="transfer-history">{t('Последнее сравнение')}</h2>
            <p>{t(latestRepeat
              ? 'Первый набор и повтор выполнены на одном тексте. Контроль даёт отдельный замер на другом отрывке.'
              : 'Сохранены результаты на двух разных отрывках.')}</p></div></div>
          <div className="lab-comparison">
            <TransferMetrics result={latestPractice} label="Первый набор" />
            {latestRepeat && <TransferMetrics result={latestRepeat} label="Повтор того же отрывка" />}
            <TransferMetrics result={latestControl} label="Контрольный отрывок" />
          </div>
        </section>}
        {latestIncomplete &&
          <p className="lab-caption">{t('Есть сохранённая практика без контроля. Для нового сравнения добавьте текст снова.')}</p>}
      </>}
  </div>
}

interface SwitchRound {
  startedAt: Date | null
  index: number
  openedAt: number | null
  wrongFirst: boolean
  entries: KeyEntry[]
  measurements: SwitchMeasurements
}

function SwitchResults({ result }: { result: SessionResult }) {
  const { t, locale } = useI18n()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const measurements = result.layoutSwitches ?? []
  const typical = percentile(measurements.map(({ latencyMs }) => latencyMs), 50)
  const wrong = measurements.filter(({ wrongFirst }) => wrongFirst).length
  return <>
    <dl className="lab-switch-summary">
      <div><dt>{t('Типичная задержка')}</dt><dd>{t('{latency} с', { latency: number.format(typical / 1000) })}</dd></div>
      <div><dt>{t('Ошибочный первый ввод')}</dt><dd>{t('{wrong} из {count}', { wrong, count: measurements.length })}</dd></div>
    </dl>
    <details className="lab-switch-details">
      <summary>{t('Все переключения')}</summary>
      <ol>{measurements.map(({ layout, latencyMs, wrongFirst }, index) => <li key={index}>
        <span>{t(layoutName[layout])}</span><strong>{t('{latency} мс', { latency: latencyMs })}</strong><span>{t(wrongFirst ? 'Первое нажатие с ошибкой' : 'С первого нажатия')}</span>
      </li>)}</ol>
    </details>
    <p className="lab-caption">{t('Это одна серия. Повторите в другой день, чтобы проверить устойчивость результата.')}</p>
  </>
}

function SwitchTraining({ active }: { active: boolean }) {
  const { t } = useI18n()
  const { state } = useAppState()
  const [firstLayout, setFirstLayout] = useState<Layout>(state.settings.layout)
  const [running, setRunning] = useState(false)
  const [interrupted, setInterrupted] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [step, setStep] = useState(0)
  const region = useRef<HTMLElement>(null)
  const round = useRef<SwitchRound | null>(null)
  const attempt = useSaveAttempt()
  const cues = switchCues(firstLayout)
  const cue = cues[step]
  const last = [...state.sessions].reverse().find((session) =>
    session.mode === 'layout-switch' && session.layoutSwitches?.length === SWITCH_COUNT)

  useLayoutEffect(() => {
    if (!active || !running || round.current?.index !== step) return
    region.current?.focus()
    round.current.openedAt = performance.now()
  }, [active, running, step])

  const start = () => {
    attempt.reset()
    round.current = { startedAt: null, index: 0, openedAt: null, wrongFirst: false, entries: [], measurements: [] }
    setStep(0)
    setWrong(false)
    setInterrupted(false)
    setRunning(true)
  }

  const interrupt = () => {
    if (!round.current) return
    round.current = null
    setRunning(false)
    setInterrupted(true)
  }

  function handleKey(event: KeyboardEvent<HTMLElement>) {
    const current = round.current
    if (!current || current.openedAt === null || current.index !== step || event.defaultPrevented || event.repeat
      || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing || event.key.length !== 1) return
    event.preventDefault()
    const correct = matchesSwitchCue(cue, event.key, event.code)
    if (!correct) {
      current.wrongFirst = true
      setWrong(true)
    }
    if (step > 0) current.entries.push({ at: Date.now(), expected: cue.key, actual: event.key, correct })
    if (!correct) return

    if (step === 0) current.startedAt = new Date()
    else current.measurements.push(switchMeasurement(cue, current.openedAt, performance.now(), current.wrongFirst))
    if (step === SWITCH_COUNT && current.startedAt) {
      const result = buildSessionResult({
        id: createId(), mode: 'layout-switch', layout: firstLayout, level: 0,
        startedAt: current.startedAt, endedAt: new Date(), correctChars: SWITCH_COUNT,
        entries: current.entries, errors: current.entries.length - SWITCH_COUNT, backspaces: 0, bestStreak: 0, score: 0,
      })
      round.current = null
      setRunning(false)
      void attempt.save({ ...result, cpm: 0, wpm: 0, keyStats: {}, confusions: {}, layoutSwitches: current.measurements })
    } else {
      current.index += 1
      current.openedAt = null
      current.wrongFirst = false
      setWrong(false)
      setStep(current.index)
    }
  }

  return <div className="lab-content" hidden={!active}>
    <section className="panel lab-panel" aria-labelledby="switch-training">
      <div className="lab-panel-heading"><div><h2 id="switch-training">{t('Переключение RU/EN')}</h2>
        <p>{t('Меняйте системную раскладку по подсказке. Мы измеряем время до первого правильного нажатия и отмечаем ошибку на первом нажатии каждого шага.')}</p></div></div>
      {running
        ? <section ref={region} className="typing-stage lab-switch-stage" tabIndex={0} onKeyDown={handleKey} onBlur={interrupt} aria-label={t('Поле переключения раскладки')}>
          <p className="lab-caption">{step === 0 ? t('Подтвердите начальную раскладку') : t('Переключение {step} из {count}', { step, count: SWITCH_COUNT })}</p>
          <div className="lab-switch-cue" role="status" data-testid="switch-cue" data-code={cue.code} data-key={cue.key}>
            <span>{t(layoutName[cue.layout])}</span><kbd>{cue.key.toLocaleUpperCase()}</kbd>
          </div>
          {wrong && <p className="error-feedback" role="alert">{t('Проверьте раскладку и нажмите указанную клавишу.')}</p>}
        </section>
        : <>
          {interrupted && <p className="error-feedback" role="status">{t('Поле потеряло фокус. Начните серию заново для точного замера.')}</p>}
          {attempt.result
            ? <>
              <SwitchResults result={attempt.result} />
              <SaveNotice status={attempt.status} retry={() => { if (attempt.result) void attempt.save(attempt.result) }} />
            </>
            : last && <div className="lab-measurement"><h3>{t('Последняя серия')}</h3><SwitchResults result={last} /></div>}
          {(attempt.status === 'idle' || attempt.status === 'saved') && <div className="lab-actions">
            <label className="lab-layout">{t('Начальная раскладка')}
              <select value={firstLayout} onChange={(event) => setFirstLayout(event.target.value as Layout)}>
                <option value="ru">{t(layoutName.ru)}</option><option value="en">{t(layoutName.en)}</option>
              </select>
            </label>
            <button type="button" className="button primary" onClick={start}>{t('Начать {count} переключений', { count: SWITCH_COUNT })}</button>
          </div>}
        </>}
    </section>
  </div>
}

export default function TrainingLab() {
  const { t } = useI18n()
  const [selection, setSelection] = useState<'transfer' | 'switch'>('transfer')
  return <div className="page lab-page">
    <header className="page-header"><div><h1>{t('Дополнительная практика')}</h1></div></header>
    <div className="segmented lab-tabs" aria-label={t('Вид практики')}>
      <button type="button" aria-pressed={selection === 'transfer'} className={selection === 'transfer' ? 'selected' : ''}
        onClick={() => setSelection('transfer')}><FileText size={16} />{t('Свой текст')}</button>
      <button type="button" aria-pressed={selection === 'switch'} className={selection === 'switch' ? 'selected' : ''}
        onClick={() => setSelection('switch')}><Keyboard size={16} />{t('Переключение RU/EN')}</button>
    </div>
    <TransferTraining active={selection === 'transfer'} />
    <SwitchTraining active={selection === 'switch'} />
  </div>
}

