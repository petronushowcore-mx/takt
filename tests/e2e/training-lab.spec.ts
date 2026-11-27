import { expect, test, type Locator, type Page } from '@playwright/test'
import type { SessionResult } from '../../src/types'

const practiceText = 'The old bookshop opened before sunrise. A reader picked an atlas, unrolled a fresh map, and planned an unfamiliar route.'
const controlText = 'The driver stopped by a wooden gate. Across the field, thin smoke rose from a chimney and hid the narrow bridge.'
const personalText = practiceText + '\n\n' + controlText

async function savedSessions(page: Page): Promise<SessionResult[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('klavish-state-v1') ?? '{"sessions":[]}').sessions)
}

async function typeKeys(field: Locator, keys: string[]) {
  await field.evaluate(async (element, strokes) => {
    for (const key of strokes) {
      element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 12))
    }
  }, keys)
}

test('own text keeps first attempt, identical repeat and distinct control without saving the source', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    let failNext = true
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'klavish-state-v1' && failNext
        && JSON.parse(value).sessions?.at(-1)?.mode === 'transfer-practice') {
        failNext = false
        throw new DOMException('Test storage failure', 'QuotaExceededError')
      }
      original.call(this, key, value)
    }
  })
  await page.goto('/#/training-lab')
  const source = page.getByLabel('Текст для упражнения')
  await page.getByLabel('Файл .txt').setInputFiles({ name: 'sample.txt', mimeType: 'text/plain', buffer: Buffer.from(personalText) })
  await expect(source).toHaveValue(personalText)
  await source.fill(personalText + ' The driver waited.')
  await page.getByRole('button', { name: 'Начать практику' }).click()
  await expect(page.getByRole('heading', { name: 'Практический отрывок' })).toBeVisible()
  await expect(page.getByText('Этап 1 из 3 · English · EN')).toBeVisible()
  const field = page.getByRole('region', { name: 'Поле набора своего текста' })
  const text = page.getByTestId('typing-text')
  const first = (await text.getAttribute('data-target'))!
  expect(first).not.toContain('narrow bridge')
  await expect(page.getByRole('heading', { name: 'Контрольный отрывок' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Свой текст' }).focus()
  await page.keyboard.press(first[0])
  await expect(text.locator('.is-done')).toHaveCount(0)
  await field.focus()
  const [firstKey, secondKey, ...rest] = [...first]
  await typeKeys(field, [firstKey, 'Backspace', '#', firstKey, '#', '#', secondKey, ...rest])
  await expect(page.getByRole('alert')).toHaveText('Результат пока не сохранён.')
  expect(await savedSessions(page)).toEqual([])
  await expect(page.getByRole('button', { name: 'Повторить отрывок' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Повторить сохранение' }).click()
  await page.getByRole('button', { name: 'Повторить отрывок' }).click()
  await expect(page.getByRole('heading', { name: 'Повтор того же отрывка' })).toBeVisible()
  await expect(text).toHaveAttribute('data-target', first)
  await expect(page.getByRole('heading', { name: 'Контрольный отрывок' })).toHaveCount(0)
  await typeKeys(field, [...first])
  await page.getByRole('button', { name: 'Начать контроль' }).click()

  await expect(page.getByRole('heading', { name: 'Контрольный отрывок' })).toBeVisible()
  const second = (await text.getAttribute('data-target'))!
  expect(second).toContain('narrow bridge')
  expect(first).not.toContain(second)
  await typeKeys(field, [...second])
  await page.getByRole('button', { name: 'Посмотреть сравнение' }).click()
  await expect(page.getByRole('heading', { name: 'Последнее сравнение' })).toBeVisible()
  const saved = await savedSessions(page)
  expect(saved).toHaveLength(3)
  const [practice, repeat, control] = saved
  expect(practice).toMatchObject({
    mode: 'transfer-practice', layout: 'en', completedText: true, firstPassErrors: 1, errors: 3, keyStats: {}, confusions: {},
  })
  expect(repeat).toMatchObject({
    mode: 'transfer-practice', layout: 'en', completedText: true, firstPassErrors: 0,
    firstPassAccuracy: 100, correctChars: first.length, transferRunId: practice.transferRunId, keyStats: {}, confusions: {},
  })
  expect(repeat.id).not.toBe(practice.id)
  expect(practice.firstPassAccuracy).toBeLessThan(100)
  expect(practice.wpm).toBeGreaterThan(0)
  expect(control).toMatchObject({
    mode: 'transfer-control', layout: 'en', completedText: true, firstPassErrors: 0, firstPassAccuracy: 100,
    transferRunId: practice.transferRunId, keyStats: {}, confusions: {},
  })
  expect(control.wpm).toBeGreaterThan(0)
  const profile = await page.evaluate(() => localStorage.getItem('klavish-state-v1'))
  expect(profile).not.toContain('bookshop')
  expect(profile).not.toContain('narrow bridge')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Последнее сравнение' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Первый набор' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Повтор того же отрывка' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Контрольный отрывок' })).toBeVisible()
})

test('switch drill confirms twelve real glyph transitions and measures first wrong keys', async ({ page }) => {
  const startTime = Date.UTC(2026, 10, 27, 12)
  await page.clock.install({ time: startTime })
  await page.clock.pauseAt(startTime + 1000)
  await page.goto('/#/training-lab')
  await page.getByRole('button', { name: 'Переключение RU/EN' }).click()
  const start = page.getByRole('button', { name: 'Начать 12 переключений' })
  await start.click()
  const field = page.getByRole('region', { name: 'Поле переключения раскладки' })
  const cue = page.getByTestId('switch-cue')
  await expect(cue).toContainText('Русская · RU')
  await expect(cue).toHaveAttribute('data-key', 'ф')
  await page.keyboard.press('Tab')
  await expect(page.getByText(/Поле потеряло фокус/)).toBeVisible()
  expect(await savedSessions(page)).toEqual([])
  await start.click()

  const delays = [450, 600, 325, 700, 385, 580, 650, 480, 725, 310, 550, 495]
  for (let step = 0; step <= 12; step += 1) {
    await expect(field).toContainText(step === 0 ? 'Подтвердите начальную раскладку' : 'Переключение ' + step + ' из 12')
    const key = (await cue.getAttribute('data-key'))!
    const code = (await cue.getAttribute('data-code'))!
    const waitBeforeWrong = step === 1 || step === 2 ? 125 : 0
    if (waitBeforeWrong) await page.clock.runFor(waitBeforeWrong)
    if (step === 1) {
      await field.dispatchEvent('keydown', { key: 'ы', code: 'KeyS' })
      await field.dispatchEvent('keydown', { key: 'ы', code: 'KeyS' })
      await expect(field).toContainText('Переключение 1 из 12')
    }
    if (step === 2) {
      await field.dispatchEvent('keydown', { key, code: 'KeyZ' })
      await expect(field).toContainText('Переключение 2 из 12')
    }
    await page.clock.runFor((step === 0 ? 900 : delays[step - 1]) - waitBeforeWrong)
    await field.dispatchEvent('keydown', { key, code })
  }

  await expect(page.getByText('Результат сохранён.')).toBeVisible()
  await expect(page.getByText('2 из 12', { exact: true })).toBeVisible()
  const [result] = await savedSessions(page)
  expect(result).toMatchObject({ mode: 'layout-switch', errors: 3, correctChars: 12, wpm: 0 })
  expect(result.layoutSwitches).toHaveLength(12)
  expect(result.layoutSwitches?.map(({ layout }) => layout)).toEqual(['en', 'ru', 'en', 'ru', 'en', 'ru', 'en', 'ru', 'en', 'ru', 'en', 'ru'])
  expect(result.layoutSwitches?.filter(({ wrongFirst }) => wrongFirst)).toHaveLength(2)
  expect(result.layoutSwitches?.map(({ latencyMs }) => latencyMs)).toEqual(delays)
  await page.reload()
  await page.getByRole('button', { name: 'Переключение RU/EN' }).click()
  await expect(page.getByRole('heading', { name: 'Последняя серия' })).toBeVisible()
})

