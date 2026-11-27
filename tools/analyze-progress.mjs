#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const langIndex = args.indexOf('--lang')
const language = langIndex >= 0 && args[langIndex + 1] === 'en' ? 'en' : 'ru'
const text = (ru, en) => language === 'en' ? en : ru
if (args.includes('--help') || !args.length) {
  console.log(text(
    `takt.. — анализ журналов обучения\n\nИспользование:\n  node tools/analyze-progress.mjs <папка logs или экспорт.json> [--out <папка>] [--days 90] [--lang en]\n\nПример Windows:\n  node tools/analyze-progress.mjs "%APPDATA%\\klavish\\logs" --out analysis`,
    `takt.. — typing progress analyzer\n\nUsage\n  node tools/analyze-progress.mjs <logs folder or export.json> [--out <folder>] [--days 90] [--lang en]\n\nWindows example\n  node tools/analyze-progress.mjs "%APPDATA%\\klavish\\logs" --out analysis --lang en`,
  ))
  process.exit(args.length ? 0 : 1)
}
const source = path.resolve(args[0])
const outIndex = args.indexOf('--out')
const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : null
const daysIndex = args.indexOf('--days')
const days = daysIndex >= 0 ? Number(args[daysIndex + 1]) : 0
const TREND_MIN_DAYS = 3
const TREND_MIN_ACTIVE_SECONDS = 10
const TREND_MIN_CORRECT_CHARS = 20
const DAY_MS = 86_400_000
const now = Date.now()
const controlModes = new Set(['diagnostic', 'benchmark', 'transfer-control'])
const targetedModes = new Set(['transition', 'transfer-practice', 'layout-switch', 'hardcore'])

function dayKey(value) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function weekKey(value) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return dayKey(date)
}
function aggregate(sessions, paceSessions = sessions.filter(isLessonPaceSession), accuracySessions = sessions) {
  const correct = sessions.reduce((sum, item) => sum + item.correctChars, 0)
  const errors = sessions.reduce((sum, item) => sum + item.errors, 0)
  const totalKeys = accuracySessions.reduce((sum, item) => sum + item.totalKeys, 0)
  const accuracyErrors = accuracySessions === sessions ? errors : accuracySessions.reduce((sum, item) => sum + item.errors, 0)
  const activeMs = sessions.reduce((sum, item) => sum + item.activeMs, 0)
  let paceChars = 0
  let paceMs = 0
  for (const item of paceSessions) {
    const sample = lessonPaceObservation(item)
    const duration = item.mode === 'diagnostic' || item.mode === 'benchmark' ? item.wallMs : sample.activeMs
    if (!Number.isFinite(duration) || duration <= 0) continue
    paceChars += sample.correctChars
    paceMs += duration
  }
  const minutes = paceMs / 60000
  return {
    sessions: sessions.length,
    correctChars: correct,
    errors,
    activeMs,
    activeMinutes: Math.round(activeMs / 6000) / 10,
    wpm: minutes ? Math.round(paceChars / 5 / minutes * 10) / 10 : null,
    cpm: minutes ? Math.round(paceChars / minutes * 10) / 10 : null,
    accuracy: totalKeys ? Math.round(Math.max(0, totalKeys - accuracyErrors) / totalKeys * 1000) / 10 : 0,
    bestStreak: sessions.reduce((best, item) => Math.max(best, item.bestStreak), 0),
  }
}
function slope(points) {
  if (points.length < 2) return 0
  const mx = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const my = points.reduce((sum, p) => sum + p.y, 0) / points.length
  const denominator = points.reduce((sum, p) => sum + (p.x - mx) ** 2, 0)
  return denominator ? points.reduce((sum, p) => sum + (p.x - mx) * (p.y - my), 0) / denominator : 0
}
function isPaceSample(item) {
  return item.activeMs >= TREND_MIN_ACTIVE_SECONDS * 1000
    && item.correctChars >= TREND_MIN_CORRECT_CHARS
    && Number.isFinite(item.wpm)
}
function lessonPaceObservation(item) {
  return item.mode === 'lesson' && item.lessonScored ? { ...item, ...item.lessonScored } : item
}
function isLessonPaceSession(item) {
  return item.mode === 'lesson' && item.completedText !== false && isPaceSample(lessonPaceObservation(item))
}
function trend(sessions) {
  const days = new Map()
  for (const item of sessions) {
    if (!isPaceSample(item)) continue
    const day = Date.parse(dayKey(item.endedAt)) / DAY_MS
    if (!Number.isFinite(day)) continue
    const sample = days.get(day) ?? { totalWpm: 0, count: 0 }
    sample.totalWpm += item.wpm
    sample.count += 1
    days.set(day, sample)
  }
  const samples = days.size
  const ready = samples >= TREND_MIN_DAYS
  const origin = days.keys().next().value
  const points = [...days].map(([day, sample]) => ({ x: day - origin, y: sample.totalWpm / sample.count }))
  const wpmPerWeek = ready ? Math.round(slope(points) * 7 * 10) / 10 : 0
  return { wpmPerWeek, samples, ready }
}
function inflection(sessions) {
  if (sessions.length < 6) return null
  let best = null
  for (let i = 3; i <= sessions.length - 3; i += 1) {
    const before = sessions.slice(i - 3, i).reduce((sum, item) => sum + item.wpm, 0) / 3
    const after = sessions.slice(i, i + 3).reduce((sum, item) => sum + item.wpm, 0) / 3
    const gain = after - before
    if (!best || gain > best.gainWpm) best = { date: sessions[i].endedAt, fromWpm: Math.round(before * 10) / 10, toWpm: Math.round(after * 10) / 10, gainWpm: Math.round(gain * 10) / 10 }
  }
  return best
}
function mergeKeys(sessions) {
  const keys = {}
  const confusions = {}
  sessions.forEach((session) => {
    Object.entries(session.keyStats || {}).forEach(([key, value]) => {
      if (!keys[key]) keys[key] = { attempts: 0, errors: 0, latencyMs: 0, latencySamples: 0 }
      keys[key].attempts += value.attempts
      keys[key].errors += value.errors
      keys[key].latencyMs += value.latencyMs
      keys[key].latencySamples += value.latencySamples ?? Math.max(0, value.attempts - value.errors)
    })
    Object.entries(session.confusions || {}).forEach(([pair, count]) => { confusions[pair] = (confusions[pair] || 0) + count })
  })
  return {
    keys: Object.entries(keys).map(([key, value]) => ({ key, attempts: value.attempts, errorRate: value.attempts ? Math.round(value.errors / value.attempts * 1000) / 10 : 0, meanLatencyMs: Math.round(value.latencyMs / Math.max(1, value.latencySamples)) })).sort((a, b) => (b.errorRate * 100 + b.meanLatencyMs / 500) - (a.errorRate * 100 + a.meanLatencyMs / 500)),
    confusions: Object.entries(confusions).map(([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count),
  }
}
function grouped(sessions, keyFunction) {
  const groups = {}
  sessions.forEach((session) => {
    const key = keyFunction(session.endedAt)
    if (!groups[key]) groups[key] = []
    groups[key].push(session)
  })
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...aggregate(values) }))
}

async function readSessions(target) {
  const stat = await fs.stat(target)
  const files = stat.isDirectory() ? (await fs.readdir(target)).filter((file) => file.endsWith('.jsonl')).sort().map((file) => path.join(target, file)) : [target]
  const sessions = []
  let ignoredLines = 0
  const addSession = (session) => {
    const endedAt = typeof session?.endedAt === 'string' ? Date.parse(session.endedAt) : NaN
    if (session?.schemaVersion === 1 && Number.isFinite(endedAt) && endedAt <= now) sessions.push(session)
    else ignoredLines += 1
  }
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8')
    if (file.endsWith('.json')) {
      const parsed = JSON.parse(raw)
      const values = Array.isArray(parsed) ? parsed : parsed.state?.sessions || parsed.sessions || []
      values.forEach(addSession)
      continue
    }
    raw.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return
      try {
        const event = JSON.parse(line)
        const session = event.type === 'session_completed' ? event.data : event.schemaVersion === 1 ? event : null
        addSession(session)
      } catch { ignoredLines += 1 }
    })
  }
  return { sessions: sessions.sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt)), files, ignoredLines }
}

const loaded = await readSessions(source)
const cutoff = days > 0 ? now - days * DAY_MS : -Infinity
const sessions = loaded.sessions.filter((session) => Date.parse(session.endedAt) >= cutoff)
if (!sessions.length) throw new Error(text(
  'В источнике нет валидных тренировок за выбранный период',
  'No valid sessions in the source for the selected period',
))
const summary = aggregate(sessions)
const activitySessions = sessions.filter(({ mode }) => !controlModes.has(mode))
const ordinaryEvidence = activitySessions.filter(({ mode }) => !targetedModes.has(mode))
const lessonPace = sessions.filter(isLessonPaceSession).map(lessonPaceObservation)
const recentLessons = lessonPace.filter(({ endedAt }) => now - Date.parse(endedAt) <= 30 * DAY_MS)
const lessonSummary = aggregate(lessonPace)
const overallTrend = trend(lessonPace)
const recentTrend = trend(recentLessons)
const weekly = grouped(lessonPace, weekKey).map((week, index, values) => {
  const previous = values[index - 1]
  const comparable = previous?.activeMs > 0 && week.activeMs > 0
    && Date.parse(week.date) - Date.parse(previous.date) === 7 * DAY_MS
  return { ...week, wpmChange: comparable ? Math.round((week.wpm - previous.wpm) * 10) / 10 : null }
})
const daily = grouped(sessions, dayKey)
const keyAnalysis = mergeKeys(ordinaryEvidence)
const acceleration = inflection(lessonPace)
const byMode = Object.entries(sessions.reduce((groups, session) => { (groups[session.mode] ||= []).push(session); return groups }, {})).map(([mode, values]) => ({
  mode,
  ...aggregate(values, mode === 'layout-switch' ? [] : values, mode === 'lesson' ? values.map(lessonPaceObservation) : values),
  ...(mode === 'hardcore' ? { pacePopulation: 'targeted-drill' } : {}),
}))
const pace = recentTrend.ready ? aggregate(recentLessons).wpm : lessonSummary.wpm
const nextGoal = pace === null ? undefined : [20, 30, 40, 50, 60, 80].find((goal) => goal > pace)
const forecastWeeks = nextGoal && recentTrend.ready && recentTrend.wpmPerWeek > 0 ? Math.max(1, Math.ceil((nextGoal - pace) / recentTrend.wpmPerWeek)) : null
const activityMs = activitySessions.reduce((sum, session) => sum + session.activeMs, 0)
const activity = {
  sessions: activitySessions.length,
  activeMs: activityMs,
  activeMinutes: Math.round(activityMs / 6000) / 10,
  days: new Set(activitySessions.map(({ endedAt }) => dayKey(endedAt))).size,
}
const recommendations = []
const recommend = (ru, en) => recommendations.push({ ru, en })
if (lessonPace.length > 0 && lessonSummary.accuracy < 94) recommend(
  'Снизьте темп на 10–15%: сначала стабилизируйте точность выше 94%, затем снова увеличивайте скорость.',
  "Slow down by 10–15%. Get your accuracy consistently above 94% before picking up the pace again.",
)
if (overallTrend.samples >= 5 && recentTrend.ready && Math.abs(recentTrend.wpmPerWeek) < 0.5) recommend(
  'Последние результаты похожи на плато. Чередуйте адаптивные тексты, уроки и короткие спринты.',
  "Your recent speed seems to have plateaued. Alternate adaptive texts, lessons, and short sprints.",
)
if (activitySessions.length > 0) {
  const spanDays = (Date.parse(dayKey(activitySessions.at(-1).endedAt)) - Date.parse(dayKey(activitySessions[0].endedAt))) / DAY_MS + 1
  if (activity.days / spanDays < 0.4) recommend(
    'Практика нерегулярна. Короткие занятия 10–15 минут чаще дадут более читаемый и устойчивый тренд.',
    "Practice has been infrequent. Short, frequent sessions of 10–15 minutes make your progress easier to see and sustain.",
  )
}
if (keyAnalysis.keys[0]?.errorRate > 8) recommend(
  `Добавьте отдельную работу над клавишей «${keyAnalysis.keys[0].key}»: у неё самый высокий вклад ошибок и задержек.`,
  `Spend more time on the “${keyAnalysis.keys[0].key}” key. It contributes most to errors and delays.`,
)
if (!recommendations.length) {
  if (lessonPace.length) recommend(
    'Продолжайте текущий режим и увеличивайте целевую скорость небольшими шагами — примерно на 2 сл/мин.',
    'Keep the current routine and increase your target speed in small steps of about 2 wpm.',
  )
  else recommend(
    'Завершите урок, чтобы получить ориентир для темпа.',
    'Complete a lesson to set a baseline for your speed.',
  )
}

const report = {
  schema: 'klavish.analysis.v1',
  generatedAt: new Date(now).toISOString(),
  source: { path: source, files: loaded.files.length, ignoredLines: loaded.ignoredLines },
  period: { from: sessions[0].endedAt, to: sessions.at(-1).endedAt, days: days || null },
  summary,
  lessonPace: lessonSummary,
  activity,
  trend: { overall: overallTrend, last30Days: recentTrend, acceleration, population: 'completed-lessons-all-layouts' },
  weekly,
  daily,
  byMode,
  weakKeys: keyAnalysis.keys.slice(0, 20),
  confusions: keyAnalysis.confusions.slice(0, 20),
  forecast: nextGoal ? { targetWpm: nextGoal, estimatedWeeks: forecastWeeks, method: 'linear extrapolation; estimate only' } : null,
  recommendations: recommendations.map(({ ru }) => ru),
}

const fmt = (value) => value === null ? '—' : language === 'en' ? String(value) : String(value).replace('.', ',')
const summaryPace = summary.wpm === null
  ? text('Темп уроков пока без замера', 'No lesson speed measurement yet')
  : text(
    `Темп уроков · ${fmt(summary.wpm)} сл/мин (${fmt(summary.cpm)} знаков/мин)`,
    `Lesson speed · ${fmt(summary.wpm)} wpm (${fmt(summary.cpm)} characters/min)`,
  )
const lessonAccuracy = lessonPace.some(({ totalKeys }) => totalKeys > 0)
  ? text(`${fmt(lessonSummary.accuracy)}% точности уроков`, `${fmt(lessonSummary.accuracy)}% lesson accuracy`)
  : text('Точность уроков пока без замера', 'No lesson accuracy measurement yet')
const trendText = (value) => value.ready
  ? text(
    `${value.wpmPerWeek > 0 ? '+' : ''}${fmt(value.wpmPerWeek)} сл/мин в неделю по ${value.samples} дням`,
    `${value.wpmPerWeek > 0 ? '+' : ''}${fmt(value.wpmPerWeek)} wpm per week across ${value.samples} days`,
  )
  : text(
    `пока мало данных. Нужны подходящие попытки в ${TREND_MIN_DAYS} разных днях`,
    `too little data yet. Eligible attempts are needed on ${TREND_MIN_DAYS} different days`,
  )
const lines = [
  text('# takt.. — картина обучения', '# takt.. — typing progress'), '',
  text(`Период: ${dayKey(report.period.from)} — ${dayKey(report.period.to)}. Сессий: ${summary.sessions}.`, `Period · ${dayKey(report.period.from)} to ${dayKey(report.period.to)}. Sessions · ${summary.sessions}.`),
  text(`Файлы источника — ${loaded.files.length}. Пропущено записей — ${loaded.ignoredLines}.`, `Source files · ${loaded.files.length}. Skipped records · ${loaded.ignoredLines}.`), '',
  text('## Сводка по всем режимам', '## Summary across all modes'), '',
  text(`- Активное время практики: ${fmt(activity.activeMinutes)} мин · ${activity.days} дн.`, `- Active practice time · ${fmt(activity.activeMinutes)} min across ${activity.days} days.`),
  text(`- Правильных знаков: ${summary.correctChars}; ошибок: ${summary.errors}.`, `- Correct characters · ${summary.correctChars}. Errors · ${summary.errors}.`),
  `- ${summaryPace}.`,
  text(`- ${lessonAccuracy}. Лучшая серия по всем записям · ${summary.bestStreak}.`, `- ${lessonAccuracy}. Best streak across all results · ${summary.bestStreak}.`),
  text(`- Изменение темпа уроков, все раскладки: ${trendText(overallTrend)}.`, `- Lesson speed trend across both layouts · ${trendText(overallTrend)}.`),
  text(`- Темп уроков за последние 30 дней: ${trendText(recentTrend)}.`, `- Lesson speed in the past 30 days · ${trendText(recentTrend)}.`), '',
]
if (acceleration) lines.push(text(
  `Наиболее заметный сдвиг скорости начался около ${dayKey(acceleration.date)}: средняя скорость трёх попыток изменилась с ${fmt(acceleration.fromWpm)} до ${fmt(acceleration.toWpm)} сл/мин (${acceleration.gainWpm > 0 ? '+' : ''}${fmt(acceleration.gainWpm)}).`,
  `The largest speed change began around ${dayKey(acceleration.date)}. Average speed across three attempts went from ${fmt(acceleration.fromWpm)} to ${fmt(acceleration.toWpm)} wpm (${acceleration.gainWpm > 0 ? '+' : ''}${fmt(acceleration.gainWpm)}).`,
), '')
lines.push(text('## Динамика уроков по неделям', '## Weekly lesson results'), '',
  text('| Неделя | Сессии | Минуты | Сл/мин | Изменение к предыдущей неделе | Точность |', '| Week | Sessions | Minutes | WPM | Change from previous week | Accuracy |'),
  '|---|---:|---:|---:|---:|---:|')
weekly.forEach((week) => {
  const change = week.wpmChange === null ? '—' : (week.wpmChange > 0 ? '+' : '') + fmt(week.wpmChange)
  lines.push(`| ${week.date} | ${week.sessions} | ${fmt(week.activeMinutes)} | ${fmt(week.wpm)} | ${change} | ${fmt(week.accuracy)}% |`)
})
lines.push('', text('## Клавиши, требующие внимания', '## Keys to work on'), '',
  text('| Клавиша | Попытки | Ошибки | Средняя задержка |', '| Key | Attempts | Error rate | Mean latency |'), '|---|---:|---:|---:|')
keyAnalysis.keys.slice(0, 10).forEach((key) => lines.push(`| ${key.key} | ${key.attempts} | ${fmt(key.errorRate)}% | ${key.meanLatencyMs} ${text('мс', 'ms')} |`))
if (keyAnalysis.confusions.length) {
  lines.push('', text('## Частые замены', '## Common substitutions'), '',
    text('| Ожидалось → нажато | Количество |', '| Expected → typed | Count |'), '|---|---:|')
  keyAnalysis.confusions.slice(0, 10).forEach((item) => lines.push(`| ${item.pair} | ${item.count} |`))
}
lines.push('', text('## Что делать дальше', '## Next steps'), '')
recommendations.forEach((item) => lines.push(`- ${item[language]}`))
if (nextGoal) {
  const estimate = forecastWeeks ? text(
    `Линейная оценка при сохранении месячного темпа: около ${forecastWeeks} недель. Это прогноз, а не гарантия.`,
    `At your current monthly rate, the estimate is about ${forecastWeeks} ${forecastWeeks === 1 ? 'week' : 'weeks'}.`,
  ) : text(
    'Для оценки срока нужен положительный тренд за последние 30 дней.',
    'An estimate requires an upward trend over the past 30 days.',
  )
  lines.push('', text(`Следующий ориентир: ${nextGoal} сл/мин.`, `Next goal · ${nextGoal} wpm.`) + ' ' + estimate)
}
lines.push('', '---', text(
  `Одно слово соответствует пяти правильным знакам. Средний темп завершённых уроков рассчитывается по активному времени, из которого исключены интервалы между нажатиями дольше 3 секунд. Тренд использует дневные средние за не менее чем ${TREND_MIN_DAYS} дней с учётом расстояния между датами. В каждом уроке нужно от ${TREND_MIN_ACTIVE_SECONDS} секунд активного набора и ${TREND_MIN_CORRECT_CHARS} правильных знаков. Для диагностики и недельного контроля темп в детализации по режимам учитывает все 45 секунд. Прочерк в таблице означает, что для сравнения не хватает замера в соседней календарной неделе. Счётчик пропусков включает повреждённые строки, записи без поддерживаемой сессии и сессии с отсутствующим, недопустимым или будущим временем окончания.`,
  `One word is five correct characters. Average speed for completed lessons uses active typing time, excluding gaps longer than three seconds. The trend uses daily averages from at least ${TREND_MIN_DAYS} days and accounts for the spacing between dates. Each lesson needs at least ${TREND_MIN_ACTIVE_SECONDS} seconds of active typing and ${TREND_MIN_CORRECT_CHARS} correct characters. Diagnostic and weekly benchmark speed in the breakdown by mode uses the full 45 seconds. A dash in the table means a measurement from the adjacent calendar week is missing. Skipped records include damaged lines, unsupported sessions, and sessions with a missing, invalid, or future end time.`,
), '')
const markdown = lines.join('\n')

console.log(text(`\ntakt.. · ${summary.sessions} сессий · ${activity.activeMinutes} мин практики · ${summaryPace} · ${lessonAccuracy}`, `\ntakt.. · ${summary.sessions} sessions · ${fmt(activity.activeMinutes)} min of practice · ${summaryPace} · ${lessonAccuracy}`))
console.log(text(`Тренд уроков, все раскладки: ${trendText(overallTrend)}`, `Lesson speed trend across both layouts · ${trendText(overallTrend)}`))
if (outDir) {
  await fs.mkdir(outDir, { recursive: true })
  const jsonPath = path.join(outDir, 'progress-report.json')
  const markdownPath = path.join(outDir, 'progress-report.md')
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8')
  await fs.writeFile(markdownPath, markdown, 'utf8')
  console.log(text(`Отчёты сохранены:\n${markdownPath}\n${jsonPath}`, `Reports saved\n${markdownPath}\n${jsonPath}`))
} else {
  console.log(text(
    '\nДобавьте --out <папка>, чтобы сохранить полный Markdown- и JSON-отчёт.',
    '\nAdd --out <folder> to save the full Markdown and JSON reports.',
  ))
}
