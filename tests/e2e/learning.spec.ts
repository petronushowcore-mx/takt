import { expect, test, type Page } from '@playwright/test'
import type { SessionResult } from '../../src/types'

async function typingTarget(page: Page): Promise<string> {
  const target = await page.getByTestId('typing-text').getAttribute('data-target')
  expect(target?.length ?? 0).toBeGreaterThan(8)
  return target!
}

async function sessions(page: Page): Promise<SessionResult[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('klavish-state-v1') ?? '{"sessions":[]}').sessions)
}

async function press(page: Page, key: string, code = '') {
  await page.evaluate((input) => window.dispatchEvent(new KeyboardEvent('keydown', { ...input, bubbles: true })), { key, code })
}

async function installClock(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.clock.install({ time: new Date('2026-11-24T11:00:00Z') })
  await page.clock.pauseAt(new Date('2026-11-24T12:00:00Z'))
}

async function startMeasurement(page: Page) {
  const target = await typingTarget(page)
  for (const key of target.slice(0, 8)) {
    await press(page, key)
    await page.clock.runFor(40)
  }
  await expect(page.getByTestId('typing-text').locator('.is-done')).toHaveCount(8)
}

async function finishPacedBenchmark(page: Page, early: number, late: number) {
  const target = await typingTarget(page)
  const startedAt = await page.evaluate(() => Date.now())
  for (const key of target.slice(0, early)) await press(page, key)
  await page.clock.runFor(44_900)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const key of target.slice(early, early + late)) await press(page, key)
  const accepted = early + late
  await expect(page.getByTestId('typing-text').locator('.is-done')).toHaveCount(accepted)

  // Move only the wall clock to test the deadline before the timer can finalise.
  await page.clock.setSystemTime(new Date(startedAt + 45_000))
  await press(page, target[accepted])
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Результат сохранён')
  const saved = (await sessions(page)).at(-1)
  expect(saved).toMatchObject({
    correctChars: accepted, wallMs: 45_000, startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(startedAt + 45_000).toISOString(), wpm: Math.round(accepted / 5 * 60 / 45 * 10) / 10,
  })
  return saved!
}

test('диагностика сохраняет результат только после интервала и ведёт к уроку', async ({ page }) => {
  await installClock(page)
  await page.goto('/#/practice/diagnostic?layout=ru')
  await expect(page.getByRole('heading', { name: 'Входная диагностика' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Показатели тренировки' })).toContainText('45сек')
  await expect(page.locator('.keyboard-wrap')).toHaveCount(0)
  await startMeasurement(page)
  await page.clock.runFor(44_000)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await sessions(page)).toHaveLength(0)
  await page.clock.runFor(1300)
  const result = page.getByRole('dialog')
  await expect(result).toContainText('Результат сохранён')
  expect(await sessions(page)).toMatchObject([{ mode: 'diagnostic', layout: 'ru', wallMs: 45_000, correctChars: 8 }])
  await result.getByRole('link', { name: 'К своему уроку' }).click()
  await expect(page).toHaveURL(/#\/practice\/ru-01$/)
})

test('контроль принимает поздний ввод, сохраняет темп за 45 секунд и сравнивает одну раскладку', async ({ page }) => {
  await installClock(page)
  const russian = '/#/practice/benchmark?layout=ru'
  await page.goto(russian)
  await expect(page.getByRole('heading', { name: 'Контроль недели' })).toBeVisible()
  const first = await finishPacedBenchmark(page, 8, 4)
  expect(first).toMatchObject({ mode: 'benchmark', layout: 'ru', weekKey: '2026-W48', wpm: 3.2 })

  await page.getByRole('dialog').getByRole('button', { name: 'К прогрессу' }).click()
  await page.goto(russian)
  await expect(page.getByRole('heading', { name: 'Результат этой недели уже сохранён' })).toBeVisible()
  await expect(page.getByTestId('typing-text')).toHaveCount(0)
  expect(await sessions(page)).toHaveLength(1)

  await page.goto('/#/practice/benchmark?layout=en')
  const distractor = await finishPacedBenchmark(page, 35, 10)
  expect(distractor).toMatchObject({ mode: 'benchmark', layout: 'en', weekKey: '2026-W48', wpm: 12 })

  await page.clock.setSystemTime(new Date('2026-12-01T12:00:00Z'))
  await page.goto(russian)
  const second = await finishPacedBenchmark(page, 16, 14)
  expect(second).toMatchObject({ mode: 'benchmark', layout: 'ru', weekKey: '2026-W49', wpm: 8 })
  expect(await sessions(page)).toHaveLength(3)
  await page.getByRole('dialog').getByRole('button', { name: 'К прогрессу' }).click()
  await expect(page.getByText(/Для сравнения нужны два замера на одном варианте/)).toBeVisible()
  await page.clock.setSystemTime(new Date('2026-12-22T12:00:00Z'))
  await page.goto(russian)
  const comparable = await finishPacedBenchmark(page, 16, 14)
  expect(comparable).toMatchObject({ mode: 'benchmark', layout: 'ru', weekKey: '2026-W52', wpm: 8 })
  await page.getByRole('dialog').getByRole('button', { name: 'К прогрессу' }).click()
  await expect(page.getByText(/\+4,8 сл\/мин · 0 п\.п\./)).toBeVisible()
})

test('открытый недельный замер обновляет текст в понедельник по UTC', async ({ page }) => {
  await page.goto('/')
  await page.clock.install({ time: new Date('2026-11-29T23:58:00Z') })
  await page.clock.pauseAt(new Date('2026-11-29T23:59:50Z'))
  await page.goto('/#/practice/benchmark?layout=ru')
  await expect(page.getByRole('heading', { name: 'Контроль недели' })).toBeVisible()
  const sundayText = await typingTarget(page)

  await page.clock.setSystemTime(new Date('2026-11-30T00:00:05Z'))
  await press(page, sundayText[0])
  await expect(page.getByText(/Началась новая неделя/)).toBeVisible()
  await expect(page.getByTestId('typing-text')).not.toHaveAttribute('data-target', sundayText)
  await expect(page.getByTestId('typing-text').locator('.is-done')).toHaveCount(0)
  expect(await sessions(page)).toHaveLength(0)

  await startMeasurement(page)
  await page.clock.runFor(45_300)
  await expect(page.getByRole('dialog')).toContainText('Результат сохранён')
  expect(await sessions(page)).toMatchObject([{
    mode: 'benchmark', layout: 'ru', weekKey: '2026-W49',
    assessmentId: 'benchmark-ru-v3-2026-W49', wallMs: 45_000, correctChars: 8,
  }])
})

test('спокойная тренировка проходит три этапа без скорости и таймера', async ({ page }) => {
  await page.goto('/#/practice/precision?layout=ru')
  await expect(page.getByRole('heading', { name: 'Спокойная тренировка' })).toBeVisible()
  const live = page.getByRole('region', { name: 'Показатели тренировки' })
  await expect(live.getByText('Точность', { exact: true })).toBeVisible()
  await expect(live.getByText('Скорость', { exact: true })).toHaveCount(0)
  await expect(live.getByText('Осталось', { exact: true })).toHaveCount(0)
  await expect(page.locator('.finger-legend span')).toHaveCount(8)
  const stages = await page.evaluate(async (text) => {
    const seen = new Set<string>()
    for (const key of text) {
      const hint = document.querySelector('.typing-stage .start-hint')?.textContent?.trim()
      if (hint) seen.add(hint)
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    return [...seen]
  }, await typingTarget(page))
  expect(stages).toEqual([
    'Этап 1 из 3 · Движения пальцев',
    'Этап 2 из 3 · Слова',
    'Этап 3 из 3 · Связный текст',
  ])
  await expect(page.getByRole('dialog')).toContainText('Точность добавлена в историю тренировок')
  expect(await sessions(page)).toMatchObject([{ mode: 'precision', layout: 'ru', completedText: true }])
})

test('ошибка раскладки даёт подсказку, а знакомая ошибка открывает немедленный и отложенный повтор', async ({ page }) => {
  await installClock(page)
  await page.goto('/#/practice/ru-01')
  const target = await typingTarget(page)
  const first = target[0].toLowerCase()
  const homeRow = 'фывапролджэ'.indexOf(first)
  expect(homeRow).toBeGreaterThanOrEqual(0)
  const latinKey = "asdfghjkl;'"[homeRow]
  const code = latinKey === ';' ? 'Semicolon' : latinKey === "'" ? 'Quote' : 'Key' + latinKey.toUpperCase()
  const warning = page.getByText('Переключи раскладку на русскую (RU).', { exact: true })
  await press(page, latinKey, code)
  await expect(warning).toHaveCount(0)
  await press(page, latinKey, code)
  await expect(warning).toBeVisible()

  const other = first === 'ф' ? 'ы' : 'ф'
  await press(page, other)
  await expect(warning).toHaveCount(0)
  for (const key of target.slice(0, 5)) await press(page, key)
  await page.getByRole('button', { name: 'Завершить', exact: true }).click()
  const followUp = page.getByRole('dialog').getByRole('link', { name: 'Потренировать ошибки' })
  await followUp.click()
  await expect(page.getByRole('heading', { name: 'Тренировка сочетаний' })).toBeVisible()
  await expect(page.getByText(first + ' → ' + other, { exact: true })).toBeVisible()
  const drill = await typingTarget(page)
  expect(drill).toContain(first)
  expect(drill).toContain(other)

  const saved = (await sessions(page)).at(-1)!
  const dueAt = Date.parse(saved.endedAt) + 86_400_000
  await page.goto('/#/lessons?layout=ru')
  const reminder = page.locator('a[href="#/practice/review?layout=ru"]')
  await page.clock.setSystemTime(new Date(dueAt - 1))
  await page.reload()
  await expect(reminder).toHaveCount(0)
  await page.clock.setSystemTime(new Date(dueAt))
  await page.reload()
  await expect(reminder).toBeVisible()
  await reminder.click()
  await expect(page.getByRole('heading', { name: 'Тренировка сочетаний' })).toBeVisible()
  await expect(page.getByText(first + ' → ' + other, { exact: true })).toBeVisible()
})
