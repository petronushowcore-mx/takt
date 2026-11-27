import { ArrowRight, Crosshair, Gauge, Orbit, Shield, Timer, Zap } from 'lucide-react'
import { Link } from 'react-router'
import { useAppState } from '@/hooks/useAppState'
import { useI18n } from '@/lib/i18n'
import { arcadeWords } from '@/data/lessons'

export default function Arcade() {
  const { t } = useI18n()
  const { state, updateSettings } = useAppState()
  const layout = state.settings.layout
  const best = (mode: 'orbit' | 'sprint') => state.sessions.filter((session) => session.mode === mode).reduce((value, session) => Math.max(value, session.score), 0)
  return (
    <div className="page arcade-page">
      <header className="page-header"><div><span className="section-tag">{t("Практика без скуки")}</span><h1>{t("Аркадная зона")}</h1><p>{t("Те же пальцы и точность, но теперь на счёту очки, жизни и секунды.")}</p></div><div className="segmented"><button className={layout === 'ru' ? 'selected' : ''} onClick={() => void updateSettings({ layout: 'ru' })}>{t("Русская")}</button><button className={layout === 'en' ? 'selected' : ''} onClick={() => void updateSettings({ layout: 'en' })}>{t("English")}</button></div></header>
      <section className="arcade-grid">
        <article className="arcade-card orbit-card">
          <div className="arcade-visual" aria-hidden="true"><span className="planet" /><span className="orbit-line" />{arcadeWords[layout].slice(0, 4).map((word, index) => <kbd key={word} style={{ '--i': index } as React.CSSProperties}>{word}</kbd>)}<Orbit size={42} /></div>
          <div className="arcade-copy"><span className="game-label"><Shield size={15} />{t("Стратегия + набор")}</span><h2>{t("Орбита")}</h2><p>{t("Слова приближаются к станции. Печатайте их до столкновения — скорость появления постепенно растёт.")}</p><ul><li><Crosshair size={15} />{t("3 жизни")}</li><li><Gauge size={15} />{t("Комбо за серию слов")}</li><li><Timer size={15} />{t("Раунд 60 секунд")}</li></ul><div className="arcade-footer"><span>{t("Рекорд:")} <strong>{best('orbit')}</strong></span><Link className="button primary" to="/arcade/orbit">{t("Запустить")} <ArrowRight size={18} /></Link></div></div>
        </article>
        <article className="arcade-card sprint-card">
          <div className="arcade-visual" aria-hidden="true"><Zap size={48} /><div className="speed-lines"><i /><i /><i /><i /></div><div className="sprint-words">{arcadeWords[layout].slice(5, 9).map((word) => <kbd key={word}>{word}</kbd>)}</div></div>
          <div className="arcade-copy"><span className="game-label"><Timer size={15} />{t("Скорость + выносливость")}</span><h2>{t("Спринт 60")}</h2><p>{t("Наберите как можно больше слов за минуту. Пробел отправляет слово, а точная серия умножает очки.")}</p><ul><li><Crosshair size={15} />{t("Ошибки видны сразу")}</li><li><Gauge size={15} />{t("Темп без остановок")}</li><li><Timer size={15} />{t("Финиш через 60 секунд")}</li></ul><div className="arcade-footer"><span>{t("Рекорд:")} <strong>{best('sprint')}</strong></span><Link className="button primary" to="/arcade/sprint">{t("Запустить")} <ArrowRight size={18} /></Link></div></div>
        </article>
      </section>
      <p className="arcade-note">{t("Игровые результаты тоже попадают в журнал: скорость, точность, активное время, серии и ошибки по клавишам.")}</p>
    </div>
  )
}
