import { LockKeyhole, Medal } from 'lucide-react'
import { achievements } from '@/data/achievements'
import { useAppState } from '@/hooks/useAppState'
import { useI18n } from '@/lib/i18n'

import { practiceOnly } from '@/lib/learning'

export default function Achievements() {
  const { t, locale } = useI18n()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const { state } = useAppState()
  const unlocked = Object.keys(state.achievements).length
  return (
    <div className="page achievements-page">
      <header className="page-header"><div><span className="section-tag">{t("Маленькие поводы продолжить")}</span><h1>{t("Достижения")}</h1><p>{t("Награды отмечают реальные изменения: регулярность, точность, серию и скорость.")}</p></div><div className="achievement-total"><Medal size={24} /><strong>{unlocked}<span> / {achievements.length}</span></strong><small>{t("открыто")}</small></div></header>
      <div className="course-progress"><div><strong>{Math.round((unlocked / achievements.length) * 100)}%</strong><span>{t("коллекции")}</span></div><div className="progress-track"><i style={{ width: `${(unlocked / achievements.length) * 100}%` }} /></div></div>
      <section className="achievement-grid">
        {achievements.map((achievement) => {
          const unlockedAt = state.achievements[achievement.id]
          const current = achievement.value(practiceOnly(state))
          const percent = unlockedAt ? 100 : Math.min(100, Math.round((current / achievement.target) * 100))
          const Icon = achievement.icon
          return <article className={`achievement-card ${unlockedAt ? 'unlocked' : ''}`} key={achievement.id}><div className="achievement-icon">{unlockedAt ? <Icon size={28} /> : <LockKeyhole size={23} />}</div><div className="achievement-copy"><h2>{t(achievement.title)}</h2><p>{t(achievement.description)}</p><div className="progress-track"><i style={{ width: `${percent}%` }} /></div><span>{unlockedAt ? t('Открыто {date}', { date: new Date(unlockedAt).toLocaleDateString(locale) }) : number.format(Math.min(achievement.target, Math.round(current * 10) / 10)) + ' / ' + number.format(achievement.target) + ' ' + t(achievement.unit)}</span></div></article>
        })}
      </section>
    </div>
  )
}
