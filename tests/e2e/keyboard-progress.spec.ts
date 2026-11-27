import { expect, test } from '@playwright/test'

test('видны точные промахи и результат своего Хардкора, отчёт содержит обе раскладки', async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'klavish-state-v1'
    if (localStorage.getItem(key)) return
    const date = new Date(Date.now() - 60_000).toISOString()
    localStorage.setItem(key, JSON.stringify({
      version: 1, profileId: 'test-keyboard-profile', createdAt: date, lessonProgress: {}, achievements: {},
      settings: { profileName: 'Имя из фикстуры', layout: 'ru', sound: false, showKeyboard: true, lessonLength: 'short', theme: 'waves' },
      sessions: [{
        schemaVersion: 1, id: 'ordinary-attempt', startedAt: date, endedAt: date,
        mode: 'adaptive', layout: 'ru', level: 0, activeMs: 25_000, wallMs: 30_000,
        totalKeys: 30, correctChars: 23, errors: 7, backspaces: 0, bestStreak: 20, wpm: 11, cpm: 55,
        accuracy: 76.7, meanLatencyMs: 410, p95LatencyMs: 710, score: 1, keyStats: {}, confusions: {}, samples: [],
        symbolStats: {
          Ж: { attempts: 12, errors: 5, misses: { ж: 4, ш: 1 } },
          '%': { attempts: 10, errors: 2, misses: { 5: 2 } },
          ф: { attempts: 8, errors: 0, misses: {} },
        },
      }],
    }))
  })
  await page.goto('/#/stats?layout=ru')
  const keyboard = page.getByRole('region', { name: 'Клавиатура и промахи' })
  const capital = keyboard.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Ж', exact: true }) })
  await expect(capital).toContainText('7 / 12')
  await expect(capital).toContainText('ж × 4')
  await keyboard.getByRole('link', { name: /Хардкор/ }).click()
  await expect(page.getByRole('heading', { name: 'Хардкор' })).toBeVisible()
  const target = await page.getByTestId('typing-text').getAttribute('data-target')
  expect(target).toBeTruthy()
  expect(target!.split(' ').every((group) => /^[Ж%]{9}ф$/.test(group))).toBe(true)
  await page.evaluate((text) => {
    for (const key of ['ж', ...text]) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  }, target!)
  const result = page.getByRole('dialog')
  await expect(result).toContainText('Тренировка сохранена')
  await result.getByRole('button', { name: 'К прогрессу' }).click()
  await expect(capital.getByRole('cell').last()).toContainText(/%.*·/)
  const download = page.waitForEvent('download')
  await keyboard.getByRole('button', { name: 'Отчёт для ИИ · JSON' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^takt-progress-[0-9-]+[.]json$/)
  const stream = await file.createReadStream()
  const bytes: Buffer[] = []
  for await (const chunk of stream!) bytes.push(Buffer.from(chunk))
  const exportText = Buffer.concat(bytes).toString('utf8')
  expect(exportText).not.toContain('Имя из фикстуры')
  expect(exportText).not.toContain(target!)
  expect(JSON.parse(exportText)).toMatchObject({
    schema: 'takt.progress.v1', profileId: 'test-keyboard-profile',
    layouts: { ru: { modes: { hardcore: { sessions: 1 } } }, en: { modes: {} } },
  })
})
