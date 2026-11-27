import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { glyphRows } from '@/lib/keyboardLayout'
import { buildProgressReport, keyboardProgress } from '@/lib/keyboardProgress'
import { useI18n } from '@/lib/i18n'
import { displayKey } from '@/lib/metrics'
import { exportFile } from '@/lib/storage'
import type { AppState, Layout } from '@/types'
import './KeyboardProgress.css'

export function KeyboardProgress({ state, layout }: { state: AppState; layout: Layout }) {
  const { t, locale } = useI18n()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const signed = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
  const percentage = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })

  function rate(value: { errorPercent: number | null; attempts: number }) {
    return value.errorPercent === null ? '—' : `${percentage.format(value.errorPercent / 100)} · ${number.format(value.attempts)}`
  }

  const [showAll, setShowAll] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { keyboard } = useMemo(() => keyboardProgress(state.sessions, layout), [state.sessions, layout])
  const byGlyph = new Map(keyboard.map((row) => [row.glyph, row]))
  const rows = (showAll ? keyboard : keyboard.filter(({ all, legacy }) => all.attempts || legacy.attempts))
    .sort((a, b) => b.all.errors + b.legacy.errors - a.all.errors - a.legacy.errors || b.all.attempts - a.all.attempts)

  const saveReport = async () => {
    setExporting(true)
    try {
      const path = await exportFile('json', JSON.stringify(buildProgressReport(state), null, 2), 'progress')
      if (path) toast.success(t("Отчёт сохранён"))
    } catch {
      toast.error(t("Не удалось сохранить отчёт"))
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="panel keyboard-progress" aria-labelledby="keyboard-progress-title">
      <header className="panel-header">
        <div>
          <h2 id="keyboard-progress-title">{t("Клавиатура и промахи")}</h2>
          <p>{t("Выбранная раскладка, включая заглавные, цифры и знаки. Цвет показывает долю ошибок за всё время.")}</p>
        </div>
        <Link className="button primary" to={'/practice/hardcore?layout=' + layout}>{t("Режим «Хардкор»")}</Link>
      </header>
      <div className="keyboard-score-map" role="group" aria-label={t("Карта доли ошибок по символам")}>
        {glyphRows[layout].map(([normal, shifted]) => (
          <div className="keyboard-score-row" key={normal}>
            {[...normal].map((glyph, index) => (
              <div className="keyboard-score-key" key={glyph}>
                {[shifted[index], glyph].map((symbol) => {
                  const record = byGlyph.get(symbol)!.all
                  const percent = record.errorPercent
                  const grade = percent === null ? 'unknown' : percent >= 20 ? 'high' : percent >= 8 ? 'medium' : 'low'
                  return <span className={'keyboard-score-symbol ' + grade} key={symbol}
                    title={symbol + ' · ' + (percent === null ? t("без замера") : t("{errors} промахов из {attempts}", { errors: number.format(record.errors), attempts: number.format(record.attempts) }))}>
                    {symbol}
                  </span>
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="muted">{t("Сравниваем два периода по 30 дней. Для изменения доли ошибок нужно по 10 нажатий на символ в каждом периоде.")}</p>
      <div className="table-scroll">
        <table>
          <caption>{t("Нажатия и изменение доли ошибок")}</caption>
          <thead><tr>
            <th scope="col">{t("Символ")}</th><th scope="col">{t("Верно / всего")}</th><th scope="col">{t("Промахи")}</th>
            <th scope="col">{t("Куда чаще")}</th><th scope="col">{t("30 дней")}</th><th scope="col">{t("До этого")}</th>
            <th scope="col">{t("Изменение")}</th><th scope="col">{t("Хардкор · отдельно")}</th>
          </tr></thead>
          <tbody>
            {rows.map(({ glyph, all, legacy, current, previous, hardcore, hardcorePrevious, hardcoreChangePoints, changePoints }) => (
              <tr key={glyph}>
                <th scope="row">{t(displayKey(glyph))}</th>
                <td>{all.attempts ? number.format(all.correct) + ' / ' + number.format(all.attempts) : '—'}</td>
                <td>{all.attempts ? number.format(all.errors) : '—'}{legacy.attempts ? <small>{t("Раньше · {errors} из {attempts} без регистра", { errors: number.format(legacy.errors), attempts: number.format(legacy.attempts) })}</small> : null}</td>
                <td>{all.misses.slice(0, 3).map(([typed, count]) => t(displayKey(typed)) + ' × ' + number.format(count)).join(', ') || '—'}</td>
                <td>{rate(current)}</td><td>{rate(previous)}</td>
                <td>{changePoints === null ? '—' : signed.format(changePoints) + ' ' + t('п.п.')}</td>
                <td>{rate(hardcore)}{hardcorePrevious.attempts > 0 &&
                  <small>{t("До этого {rate}", { rate: rate(hardcorePrevious) })}{hardcoreChangePoints !== null && ' · ' + signed.format(hardcoreChangePoints) + ' ' + t('п.п.')}</small>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8}>{t("После первых упражнений здесь появятся результаты по символам.")}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="action-row">
        <button className="button secondary" onClick={() => setShowAll(!showAll)}>{showAll ? t("Только измеренные") : t("Все символы")}</button>
        <button className="button secondary" disabled={exporting} onClick={() => { void saveReport() }}><Download size={17} />{t("Отчёт для ИИ · JSON")}</button>
      </div>
    </section>
  )
}
