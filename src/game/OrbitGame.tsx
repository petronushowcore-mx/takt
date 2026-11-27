import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Heart, Orbit, Play, RotateCcw, Shield, Trophy } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { arcadeWords } from '@/data/lessons'
import { useAppState } from '@/hooks/useAppState'
import { useI18n } from '@/lib/i18n'
import { useArcadeSave } from './useArcadeSave'
import { buildSessionResult, type KeyEntry } from '@/lib/metrics'
import { createId } from '@/lib/storage'
import type { SessionResult } from '@/types'

interface Entity { id: number; word: string; x: number; y: number; speed: number }
const ROUND_MS = 60000

export default function OrbitGame() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { state } = useAppState()
  const { saveStatus, saveResult } = useArcadeSave()
  const [entities, setEntities] = useState<Entity[]>([])
  const [buffer, setBuffer] = useState('')
  const [lives, setLives] = useState(3)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [timeLeft, setTimeLeft] = useState(60)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SessionResult | null>(null)
  const [runId, setRunId] = useState(0)
  const entitiesRef = useRef<Entity[]>([])
  const bufferRef = useRef('')
  const livesRef = useRef(3)
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
  const nextId = useRef(1)
  const runningRef = useRef(false)

  const finish = useCallback(() => {
    if (endedRef.current || !startedAtRef.current) return
    endedRef.current = true
    runningRef.current = false
    setRunning(false)
    const session = buildSessionResult({ id: createId(), startedAt: startedAtRef.current, endedAt: new Date(), entries: entriesRef.current, correctChars: committedCharsRef.current, errors: errorsRef.current, backspaces: backspacesRef.current, bestStreak: bestRef.current, mode: 'orbit', layout: state.settings.layout, level: 0, score: scoreRef.current })
    setResult(session)
    void saveResult(session)
  }, [saveResult, state.settings.layout])

  const start = () => {
    entitiesRef.current = []
    bufferRef.current = ''
    livesRef.current = 3
    scoreRef.current = 0
    comboRef.current = 0
    committedCharsRef.current = 0
    errorsRef.current = 0
    backspacesRef.current = 0
    streakRef.current = 0
    bestRef.current = 0
    entriesRef.current = []
    startedAtRef.current = new Date()
    endedRef.current = false
    nextId.current = 1
    setEntities([]); setBuffer(''); setLives(3); setScore(0); setCombo(0); setTimeLeft(60); setResult(null)
    runningRef.current = true
    setRunning(true)
    setRunId((value) => value + 1)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  useEffect(() => {
    if (!running) return
    let previous = performance.now()
    let elapsed = 0
    let spawnIn = 300
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = Math.min(100, now - previous)
      previous = now
      elapsed += delta
      spawnIn -= delta
      if (spawnIn <= 0) {
        const words = arcadeWords[state.settings.layout]
        const entity: Entity = { id: nextId.current++, word: words[Math.floor(Math.random() * words.length)], x: 5 + Math.random() * 78, y: -4, speed: 5.1 + elapsed / 18000 + Math.random() * 1.5 }
        entitiesRef.current.push(entity)
        spawnIn = Math.max(1050, 2700 - elapsed / 35)
      }
      entitiesRef.current = entitiesRef.current.map((entity) => ({ ...entity, y: entity.y + entity.speed * delta / 1000 }))
      const missed = entitiesRef.current.filter((entity) => entity.y >= 88)
      if (missed.length) {
        livesRef.current = Math.max(0, livesRef.current - missed.length)
        comboRef.current = 0
        streakRef.current = 0
        setLives(livesRef.current); setCombo(0)
        if (!entitiesRef.current.some((entity) => entity.y < 88 && entity.word.startsWith(bufferRef.current))) {
          bufferRef.current = ''
          setBuffer('')
        }
      }
      entitiesRef.current = entitiesRef.current.filter((entity) => entity.y < 88)
      setEntities([...entitiesRef.current])
      setTimeLeft(Math.max(0, Math.ceil((ROUND_MS - elapsed) / 1000)))
      if (elapsed >= ROUND_MS || livesRef.current <= 0) finish()
    }, 50)
    return () => window.clearInterval(timer)
  }, [running, finish, runId, state.settings.layout])

  useEffect(() => {
    if (!running) return
    const handler = (event: KeyboardEvent) => {
      if (!runningRef.current || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
      if (event.key === 'Backspace') {
        event.preventDefault()
        if (!bufferRef.current) return
        bufferRef.current = bufferRef.current.slice(0, -1)
        backspacesRef.current += 1
        streakRef.current = 0
        entriesRef.current.push({ at: Date.now(), expected: '', actual: 'Backspace', correct: true, backspace: true })
        setBuffer(bufferRef.current)
        return
      }
      if (event.key.length !== 1) return
      event.preventDefault()
      const prefix = bufferRef.current
      const nextBuffer = prefix + event.key.toLocaleLowerCase()
      const candidate = entitiesRef.current.find((entity) => entity.word.startsWith(nextBuffer))
      let expected = candidate?.word[prefix.length]
      if (!expected && prefix) {
        const nextKeys = new Set(entitiesRef.current
          .filter((entity) => entity.word.startsWith(prefix))
          .map((entity) => entity.word[prefix.length]))
        if (nextKeys.size === 1) expected = nextKeys.values().next().value
      }
      const correct = Boolean(candidate)
      entriesRef.current.push({ at: Date.now(), expected: expected ?? '', actual: event.key, correct, unattributed: !expected })
      if (correct) {
        streakRef.current += 1
        bestRef.current = Math.max(bestRef.current, streakRef.current)
        bufferRef.current = nextBuffer
        if (candidate && nextBuffer === candidate.word) {
          committedCharsRef.current += candidate.word.length
          entitiesRef.current = entitiesRef.current.filter((entity) => entity.id !== candidate!.id)
          scoreRef.current += Math.round(candidate.word.length * 10 * (1 + comboRef.current * 0.12))
          comboRef.current += 1
          bufferRef.current = ''
          setScore(scoreRef.current); setCombo(comboRef.current); setEntities([...entitiesRef.current])
        }
      } else {
        errorsRef.current += 1
        streakRef.current = 0
        comboRef.current = 0
        bufferRef.current = ''
        setCombo(0)
      }
      setBuffer(bufferRef.current)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [running, runId])

  return (
    <div className="game-page">
      <header className="game-header"><Link to="/arcade" className="icon-button" aria-label={t("Вернуться к аркадам")}><ArrowLeft size={20} /></Link><div><span>{t("Аркада")}</span><h1>{t("Орбита")}</h1></div><div className="game-hud"><span><Trophy size={17} />{score}</span><span className="combo">×{combo + 1}</span><span>{Array.from({ length: 3 }).map((_, i) => <Heart key={i} size={18} fill={i < lives ? 'currentColor' : 'none'} className={i < lives ? 'alive' : ''} />)}</span><strong>{timeLeft}</strong></div></header>
      <section className="orbit-arena" aria-label={t("Игровое поле «Орбита»")}>
        <div className="stars" aria-hidden="true" />
        <div className="station" aria-hidden="true"><Shield size={36} /><span>{t("СТАНЦИЯ")}</span></div>
        {entities.map((entity) => <div className={`falling-word ${buffer && entity.word.startsWith(buffer) ? 'targeted' : ''}`} key={entity.id} style={{ left: `${entity.x}%`, top: `${entity.y}%` }}><kbd>{entity.word}</kbd><i style={{ width: `${(buffer.length / entity.word.length) * 100}%` }} /></div>)}
        <div className="orbit-input"><span>{t("Ввод")}</span><strong>{buffer || '—'}</strong><small>{t("Начните вводить любое видимое слово")}</small></div>
        {!running && !result && <div className="game-start"><Orbit size={44} /><h2>{t("Защитите станцию")}</h2><p>{t("Печатайте падающие слова. За каждое уничтоженное слово растёт комбо. Три пропущенных слова завершают раунд.")}</p><button className="button primary" onClick={start}><Play size={18} />{t("Начать раунд")}</button></div>}
      </section>
      <Dialog open={Boolean(result)} onOpenChange={(open) => { if (!open) navigate('/arcade') }}><DialogContent className="result-dialog"><DialogHeader><DialogTitle>{t("Раунд завершён")}</DialogTitle><DialogDescription>{t(saveStatus === 'saved' ? 'Результат добавлен в журнал тренировок.' : saveStatus === 'saving' ? 'Сохраняем результат…' : 'Результат не удалось записать в журнал.')}</DialogDescription></DialogHeader>{result && <div className="result-stats"><div><strong>{result.score}</strong><span>{t("очков")}</span></div><div><strong>{result.wpm}</strong><span>{t("слов в минуту")}</span></div><div><strong>{result.accuracy}%</strong><span>{t("точность")}</span></div><div><strong>{result.bestStreak}</strong><span>{t("серия знаков")}</span></div></div>}<div className="dialog-actions">{saveStatus === 'failed' && result && <button className="button secondary" onClick={() => void saveResult(result)}>{t("Повторить сохранение")}</button>}<button className="button ghost" onClick={start}><RotateCcw size={17} />{t("Ещё раунд")}</button><button className="button primary" onClick={() => navigate('/arcade')}>{t("К аркадам")}</button></div></DialogContent></Dialog>
    </div>
  )
}
