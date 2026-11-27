import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const dayMs = 86400000
  const sessions = [40, 35, 30].map((wpm, index) => {
    const end = Date.now() - (15 - index * 3) * dayMs
    return {
      schemaVersion: 1,
      id: 'trend-' + index,
      startedAt: new Date(end - 60000).toISOString(),
      endedAt: new Date(end).toISOString(),
      layout: 'ru',
      mode: 'lesson',
      lessonId: 'ru-01',
      completedText: true,
      activeMs: 60000,
      wallMs: 60000,
      correctChars: wpm * 5,
      totalKeys: wpm * 5,
      wpm,
      accuracy: 100,
      errors: 0,
      keyStats: {},
      confusions: {},
      samples: [],
    }
  })
  await page.addInitScript((profile) => {
    const key = 'klavish-state-v1'
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(profile))
  }, {
    version: 1,
    profileId: 'progress-display',
    createdAt: sessions[0].startedAt,
    settings: { layout: 'ru', profileName: 'Кики' },
    sessions,
    lessonProgress: { 'ru-01': { attempts: 1, bestWpm: 0 } },
    achievements: { 'speed-60': sessions[0].startedAt },
  })
})

test('тренд относится к выбранному периоду', async ({ page }) => {
  await page.goto('/#/stats')
  await expect(page.getByText('Темп снизился', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '7 дней', exact: true }).click()
  await expect(page.getByText('Собираем первые ориентиры', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Всё время', exact: true }).click()
  await expect(page.getByText('Темп снизился', { exact: true })).toBeVisible()
})

test('при снижении темпа совет соответствует снижению', async ({ page }) => {
  await page.goto('/#/stats')
  await expect(page.getByText('Темп снизился', { exact: true })).toBeVisible()
  await expect(page.getByText(/сдвинуть плато/)).toHaveCount(0)
})

test('без замера в периоде экран показывает пропуск и не прогнозирует темп', async ({ page }) => {
  await page.goto('/#/stats')
  await expect(page.getByText('Темп снизился', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    const key = 'klavish-state-v1'
    const profile = JSON.parse(localStorage.getItem(key)!)
    for (const [index, session] of profile.sessions.entries()) {
      const wpm = 20 + index * 7
      Object.assign(session, { wpm, correctChars: wpm * 5, totalKeys: wpm * 5 })
    }
    localStorage.setItem(key, JSON.stringify(profile))
  })
  await page.reload()
  await expect(page.getByText(/ориентир 30 сл\/мин/)).toBeVisible()
  await page.getByRole('button', { name: '7 дней', exact: true }).click()
  await expect(page.getByText(/ориентир \d+ сл\/мин/)).toHaveCount(0)
  const metric = (label: string) => page.getByRole('article').filter({ has: page.getByText(label, { exact: true }) }).locator('.stat-value')
  await expect(metric('Темп уроков')).toHaveText('—')
  await expect(metric('Точность уроков')).toHaveText('—')
  await page.goto('/')
  await expect(metric('Темп уроков сегодня')).toHaveText('—')
  await expect(metric('Точность уроков')).toHaveText('—')
})

test('переключение добавляет время практики и строку истории без темпа уроков', async ({ page }) => {
  await page.goto('/#/stats')
  await page.evaluate(() => {
    const key = 'klavish-state-v1'
    const profile = JSON.parse(localStorage.getItem(key)!)
    const now = Date.now()
    profile.sessions = [Object.assign(profile.sessions[0], {
      id: 'switch-only', mode: 'layout-switch', lessonId: undefined, wpm: 0, cpm: 0, accuracy: 80,
      correctChars: 12, totalKeys: 15, errors: 3, activeMs: 3600, wallMs: 3600,
      startedAt: new Date(now - 3600).toISOString(), endedAt: new Date(now).toISOString(),
    })]
    localStorage.setItem(key, JSON.stringify(profile))
  })
  await page.reload()
  const metric = (label: string) => page.getByRole('article').filter({ has: page.getByText(label, { exact: true }) }).locator('.stat-value')
  await expect(metric('Темп уроков')).toHaveText('—')
  await expect(metric('Практика')).toHaveText(/^0,1\s*мин$/)
  const row = page.getByRole('row').filter({ hasText: 'Смена раскладки' })
  await expect(row.getByRole('cell').nth(2)).toHaveText('—')
  await page.goto('/')
  await expect(metric('Темп уроков сегодня')).toHaveText('—')
  await expect(metric('Активное время практики')).toHaveText(/^0,1\s*мин$/)
  await expect(metric('Дней практики подряд')).toHaveText(/^1\s*день$/)
})

test('короткая попытка без замера не отображается как рекорд', async ({ page }) => {
  await page.goto('/#/lessons')
  await expect(page.getByRole('heading', { name: 'От опорного ряда к свободному набору' })).toBeVisible()
  await expect(page.getByText('Лучший: 0', { exact: true })).toHaveCount(0)
})

test('открытая ранее награда показывает полный прогресс', async ({ page }) => {
  await page.goto('/#/achievements')
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Быстрее мысли', exact: true }) })
  await expect(card.getByText(/^Открыто /)).toBeVisible()
  await expect(card.locator('.progress-track i')).toHaveAttribute('style', /width: 100%/)
})
