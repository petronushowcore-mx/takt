import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Play, RotateCcw, Timer, Zap } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { arcadeWords } from '@/data/lessons'
import { useAppState } from '@/hooks/useAppState'
import { useI18n } from '@/lib/i18n'
import { useArcadeSave } from './useArcadeSave'
import { buildSessionResult, type KeyEntry } from '@/lib/metrics'
import { createId } from '@/lib/storage'
import type { SessionResult } from '@/types'

const ROUND_MS = 60000
function shuffledWords(layout: 'ru' | 'en') {
  const words = arcadeWords[layout]
  return Array.from({ length: 120 }, () => words[Math.floor(Math.random() * words.length)])
}

export default function SprintGame() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { state } = useAppState()
  const { saveStatus, saveResult } = useArcadeSave()
  const [words, setWords] = useState<string[]>([])
  const [wordIndex, setWordIndex] = useState(0)
  const [input, setInput] = useState('')
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [timeLeft, setTimeLeft] = useState(60)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SessionResult | null>(null)
  const inputRef = useRef('')
  const indexRef = useRef(0)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const committedCharsRef = useRef(0)
  const errorsRef = useRef(0)
  const backspacesRef = useRef(0)
  const streakRef = useRef(0)
  const bestRef = useRef(0)
  const entriesRef = useRef<KeyEntry[]>([])
  const startedAtRef = useRef<Date | null>(null)
  const endedRef = useRef(false)
  const wordsRef = useRef<string[]>([])

  const finish = useCallback(() => {
    if (endedRef.current || !startedAtRef.current) return
    endedRef.current = true
    setRunning(false)
    const session = buildSessionResult({ id: createId(), startedAt: startedAtRef.current, endedAt: new Date(), entries: entriesRef.current, correctChars: committedCharsRef.current, errors: errorsRef.current, backspaces: backspacesRef.current, bestStreak: bestRef.current, mode: 'sprint', layout: state.settings.layout, level: 0, score: scoreRef.current })
    setResult(session)
    void saveResult(session)
  }, [saveResult, state.settings.layout])

  const start = () => {
    const nextWords = shuffledWords(state.settings.layout)
    wordsRef.current = nextWords
    setWords(nextWords)
    inputRef.current = ''; indexRef.current = 0; scoreRef.current = 0; comboRef.current = 0; committedCharsRef.current = 0; errorsRef.current = 0; backspacesRef.current = 0; streakRef.current = 0; bestRef.current = 0; entriesRef.current = []
    startedAtRef.current = new Date(); endedRef.current = false
    setInput(''); setWordIndex(0); setScore(0); setCombo(0); setTimeLeft(60); setResult(null); setRunning(true)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  useEffect(() => {
    if (!running) return
    const started = performance.now()
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, ROUND_MS - (performance.now() - started))
      setTimeLeft(Math.ceil(remaining / 1000))
      if (remaining <= 0) finish()
    }, 200)
    return () => window.clearInterval(timer)
  }, [running, finish])

  useEffect(() => {
    if (!running) return
    const handler = (event: KeyboardEvent) => {
      if (endedRef.current || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
      const current = wordsRef.current[indexRef.current] ?? ''
      if (event.key === 'Backspace') {
        event.preventDefault()
        if (!inputRef.current) return
        inputRef.current = inputRef.current.slice(0, -1)
        backspacesRef.current += 1
        streakRef.current = 0
        entriesRef.current.push({ at: Date.now(), expected: current[inputRef.current.length] ?? '', actual: 'Backspace', correct: true, backspace: true })
        setInput(inputRef.current)
        return
      }
      if (event.key.length !== 1) return
      event.preventDefault()
      const position = inputRef.current.length
      const expected = current[position] ?? ' '
      const completeWord = inputRef.current === current
      const correct = event.key === ' ' ? completeWord : event.key.toLocaleLowerCase() === expected
      entriesRef.current.push({ at: Date.now(), expected, actual: event.key, correct })
      if (correct) {
        streakRef.current += 1
        bestRef.current = Math.max(bestRef.current, streakRef.current)
      } else {
        errorsRef.current += 1
        streakRef.current = 0
        comboRef.current = 0
        setCombo(0)
      }
      if (event.key === ' ') {
        if (completeWord) {
          committedCharsRef.current += current.length + 1
          scoreRef.current += Math.round(current.length * 10 * (1 + comboRef.current * 0.1))
          comboRef.current += 1
          indexRef.current += 1
          if (indexRef.current >= wordsRef.current.length - 4) {
            wordsRef.current = [...wordsRef.current, ...shuffledWords(state.settings.layout)]
            setWords(wordsRef.current)
          }
          inputRef.current = ''
          setWordIndex(indexRef.current); setScore(scoreRef.current); setCombo(comboRef.current)
        }
      } else inputRef.current += event.key.toLocaleLowerCase()
      setInput(inputRef.current)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [running, state.settings.layout])

  const current = words[wordIndex] ?? ''
  return (
    <div className="game-page sprint-page">
      <header className="game-header"><Link to="/arcade" className="icon-button" aria-label={t("Вернуться к аркадам")}><ArrowLeft size={20} /></Link><div><span>{t("Аркада")}</span><h1>{t("Спринт 60")}</h1></div><div className="game-hud"><span><Zap size={17} />{score}</span><span className="combo">{t("серия ×{combo}", { combo: combo + 1 })}</span><strong><Timer size={18} />{timeLeft}</strong></div></header>
      <div className="sprint-time-track"><i style={{ width: `${(timeLeft / 60) * 100}%` }} /></div>
      <section className="sprint-arena">
        <div className="word-queue" aria-label={t("Очередь слов")}>{words.slice(wordIndex + 1, wordIndex + 5).map((word, index) => <span key={`${word}-${index}`} style={{ opacity: 1 - index * 0.2 }}>{word}</span>)}</div>
        {running && <div className="sprint-current"><div className="sprint-target" aria-label={t("Текущее слово: {word}", { word: current })}>{Array.from(current).map((char, index) => <span key={index} className={index < input.length ? input[index] === char ? 'correct' : 'wrong' : index === input.length ? 'current' : ''}>{char}</span>)}</div><div className="sprint-input"><span>{input || ' '}</span><i /></div><p>{t("Наберите слово и нажмите")} <kbd>{t("пробел")}</kbd></p></div>}
        {!running && !result && <div className="game-start"><Zap size={44} /><h2>{t("Шестьдесят секунд ритма")}</h2><p>{t("Печатайте слова и подтверждайте каждое пробелом. Неверную букву можно удалить Backspace. Точные слова подряд увеличивают множитель очков.")}</p><button className="button primary" onClick={start}><Play size={18} />{t("Начать спринт")}</button></div>}
      </section>
      <Dialog open={Boolean(result)} onOpenChange={(open) => { if (!open) navigate('/arcade') }}><DialogContent className="result-dialog"><DialogHeader><DialogTitle>{t("Финиш!")}</DialogTitle><DialogDescription>{t(saveStatus === 'saved' ? 'Результат добавлен в статистику.' : saveStatus === 'saving' ? 'Сохраняем результат…' : 'Результат не удалось записать в журнал.')}</DialogDescription></DialogHeader>{result && <div className="result-stats"><div><strong>{result.score}</strong><span>{t("очков")}</span></div><div><strong>{result.wpm}</strong><span>{t("слов в минуту")}</span></div><div><strong>{result.accuracy}%</strong><span>{t("точность")}</span></div><div><strong>{result.bestStreak}</strong><span>{t("серия знаков")}</span></div></div>}<div className="dialog-actions">{saveStatus === 'failed' && result && <button className="button secondary" onClick={() => void saveResult(result)}>{t("Повторить сохранение")}</button>}<button className="button ghost" onClick={start}><RotateCcw size={17} />{t("Ещё спринт")}</button><button className="button primary" onClick={() => navigate('/arcade')}>{t("К аркадам")}</button></div></DialogContent></Dialog>
    </div>
  )
}
