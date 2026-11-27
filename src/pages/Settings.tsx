import { useEffect, useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Monitor, RotateCcw, Settings2, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppState } from '@/hooks/useAppState'
import { getDesktopInfo } from '@/lib/storage'
import type { DesktopInfo, Language, Theme } from '@/types'
import { useI18n } from '@/lib/i18n'
import { languages } from '@/lib/language'

const themes: { value: Theme; label: string }[] = [
  { value: 'waves', label: 'Топологические волны' },
  { value: 'dark', label: 'Тёмная' },
]

export default function Settings() {
  const { t } = useI18n()
  const { state, updateSettings, resetProgress } = useAppState()
  const [info, setInfo] = useState<DesktopInfo | null>(null)
  const savedName = state.settings.profileName ?? ''
  const [profileName, setProfileName] = useState(savedName)
  useEffect(() => { getDesktopInfo().then(setInfo).catch(() => {}) }, [])
  return (
    <div className="page settings-page">
      <header className="page-header"><div><span className="section-tag">{t("Под себя")}</span><h1>{t("Настройки")}</h1><p>{t("Всё сохраняется локально и применяется к следующим тренировкам.")}</p></div><Settings2 size={32} /></header>
      <section className="settings-list">
        <article className="setting-row">
          <div><h2 id="theme-label">{t("Тема оформления")}</h2><p>{t("Фирменные жёлтые кольца или однотонный фон.")}</p></div>
          <div className="segmented theme-options" role="group" aria-labelledby="theme-label">
            {themes.map(({ value, label }) => (
              <button key={value} type="button" aria-pressed={state.settings.theme === value}
                className={state.settings.theme === value ? 'selected' : ''}
                onClick={() => void updateSettings({ theme: value })}>{t(label)}</button>
            ))}
          </div>
        </article>
        <article className="setting-row">
          <div><h2><label htmlFor="profile-name">{t("Имя профиля")}</label></h2><p>{t("Отображается рядом с твоим прогрессом.")}</p></div>
          <form className="segmented" onSubmit={(event) => {
            event.preventDefault()
            void updateSettings({ profileName: profileName.trim() })
          }}>
            <input id="profile-name" className="w-36 min-w-0 bg-transparent px-3" type="text" value={profileName} maxLength={40} placeholder={t('Введи имя')} autoComplete="off" onChange={(event) => setProfileName(event.target.value)} />
            <button type="submit" disabled={profileName.trim() === savedName}>{t("Сохранить")}</button>
          </form>
        </article>
        <article className="setting-row">
          <div><h2><label htmlFor="interface-language">{t('Язык интерфейса')}</label></h2><p>{t('Выберите язык меню и подсказок. Раскладка для набора задаётся отдельно.')}</p></div>
          <div className="segmented">
            <select id="interface-language" data-testid="interface-language" className="px-3 py-2 text-inherit" value={state.settings.language ?? 'ru'}
              onChange={(event) => void updateSettings({ language: event.target.value as Language })}>
              {Object.entries(languages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </article>
        <article className="setting-row"><div><h2>{t("Основная раскладка")}</h2><p>{t("Определяет начальную раскладку курса, тренировок, аркад и упражнения на переключение.")}</p></div><div className="segmented"><button className={state.settings.layout === 'ru' ? 'selected' : ''} onClick={() => void updateSettings({ layout: 'ru' })}>{t("Русская")}</button><button className={state.settings.layout === 'en' ? 'selected' : ''} onClick={() => void updateSettings({ layout: 'en' })}>{t("English")}</button></div></article>
        <article className="setting-row"><div><h2>{t("Длина текста")}</h2><p>{t("Количество знаков зависит от урока и режима.")}</p></div><div className="segmented">{(['short', 'normal', 'long'] as const).map((value) => <button key={value} className={state.settings.lessonLength === value ? 'selected' : ''} onClick={() => void updateSettings({ lessonLength: value })}>{t({ short: 'Короткий', normal: 'Обычный', long: 'Длинный' }[value])}</button>)}</div></article>
        <article className="setting-row"><div><h2>{t("Экранная клавиатура")}</h2><p>{t("Подсвечивает следующую клавишу и показывает палец.")}</p></div><button role="switch" aria-checked={state.settings.showKeyboard} className={`switch ${state.settings.showKeyboard ? 'on' : ''}`} onClick={() => void updateSettings({ showKeyboard: !state.settings.showKeyboard })}><i /><span>{t(state.settings.showKeyboard ? 'Включена' : 'Выключена')}</span></button></article>
        <article className="setting-row"><div><h2>{t("Звук ошибки")}</h2><p>{t("Короткий тихий сигнал без внешних аудиофайлов.")}</p></div><button role="switch" aria-checked={state.settings.sound} className={`switch ${state.settings.sound ? 'on' : ''}`} onClick={() => void updateSettings({ sound: !state.settings.sound })}><Volume2 size={18} /><i /><span>{t(state.settings.sound ? 'Включён' : 'Выключён')}</span></button></article>
      </section>
      <section className="panel about-panel"><Monitor size={25} /><div><h2>{info?.isDesktop ? `takt.. ${info.version}` : 'takt..'}</h2><p>{info?.isDesktop ? t('Локальное приложение · {platform} {arch}', { platform: info.platform, arch: info.arch }) : t('Предпросмотр в браузере. В desktop-версии данные дополнительно пишутся в JSONL-журналы.')}</p></div></section>
      <section className="danger-zone"><div><h2>{t("Сбросить прогресс")}</h2><p>{t("Удаляет тренировки, достижения и локальные журналы. Настройки сохранятся.")}</p></div><AlertDialog><AlertDialogTrigger asChild><button className="button danger"><RotateCcw size={17} />{t('Сбросить данные')}</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("Удалить весь прогресс?")}</AlertDialogTitle><AlertDialogDescription>{t("Это действие нельзя отменить. Сначала экспортируйте данные на странице «Прогресс», если они понадобятся позже.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Отмена")}</AlertDialogCancel><AlertDialogAction onClick={() => { void resetProgress().then(() => toast.success(t('Прогресс сброшен')), () => toast.error(t('Не удалось сбросить прогресс.'))) }}>{t("Удалить прогресс")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></section>
    </div>
  )
}
