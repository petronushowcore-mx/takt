import { expect, test } from '@playwright/test'
import type { AppState, SessionResult } from '../../src/types'

const noon = Date.parse('2026-11-24T12:00:00Z')

function recentPractice(id: string, minutesAgo: number): SessionResult {
  const endedAt = noon - minutesAgo * 60_000
  return {
    schemaVersion: 1,
    id,
    startedAt: new Date(endedAt - 30_000).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    mode: 'adaptive',
    layout: 'ru',
    level: 1,
    completedText: true,
    activeMs: 30_000,
    wallMs: 30_000,
    totalKeys: 100,
    correctChars: 100,
    errors: 0,
    backspaces: 0,
    bestStreak: 100,
    cpm: 200,
    wpm: 40,
    accuracy: 100,
    meanLatencyMs: 200,
    p95LatencyMs: 420,
    score: 1000,
    keyStats: {},
    confusions: {},
    samples: [],
    transitions: {
      'а->о': [400, 420, 420, 440],
      'о->а': [110, 120, 120, 130],
      'ф->ы': [140, 145, 145, 150],
    },
  }
}

test('с уроков открывает упражнение для медленного перехода и сравнивает замеры с обычным набором', async ({ page }) => {
  const profile: AppState = {
    version: 1,
    profileId: 'coaching-v1',
    createdAt: new Date(noon - 86_400_000).toISOString(),
    sessions: [recentPractice('coaching-first', 10), recentPractice('coaching-second', 5)],
    lessonProgress: {},
    achievements: {},
    settings: { layout: 'ru', sound: false, showKeyboard: false, lessonLength: 'short', theme: 'waves' },
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((initial) => {
    const key = 'klavish-state-v1'
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial))
  }, profile)
  await page.goto('/')
  await page.clock.install({ time: new Date(noon - 60_000) })
  await page.clock.pauseAt(new Date(noon))
  await page.goto('/#/lessons?layout=ru')

  await expect(page.getByText('Медленные переходы', { exact: true })).toBeVisible()
  const drillLink = page.getByRole('link', { name: 'Переходы между буквами', exact: true })
  await expect(drillLink).toHaveAttribute('href', '#/practice/transition?layout=ru')
  await drillLink.click()
  await expect(page).toHaveURL(/#\/practice\/transition\?layout=ru$/)
  await expect(page.getByRole('heading', { name: 'Переходы между буквами', exact: true })).toBeVisible()

  const target = await page.getByTestId('typing-text').getAttribute('data-target')
  expect(target).toBeTruthy()
  const occurrences = target!.match(/ао/g)?.length ?? 0
  expect(occurrences).toBeGreaterThanOrEqual(8)
  for (const [index, key] of [...target!].entries()) {
    if (index) await page.clock.runFor(125)
    await page.evaluate((input) => window.dispatchEvent(new KeyboardEvent('keydown', { key: input, bubbles: true })), key)
  }

  const comparison = page.getByRole('dialog').getByRole('listitem').filter({ hasText: 'ао' })
  await expect(comparison).toContainText('это упражнение 125 мс')
  await expect(comparison).toContainText('обычные тексты 420 мс')
  await expect(page.getByRole('dialog')).toContainText('Замеры в обычных текстах и в упражнении получены в разных заданиях.')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('klavish-state-v1')!) as AppState)
  expect(saved.profileId).toBe(profile.profileId)
  expect(saved.sessions.slice(0, 2)).toEqual(profile.sessions)
  expect(saved.sessions).toHaveLength(3)
  expect(saved.sessions.at(-1)).toMatchObject({
    schemaVersion: 1, mode: 'transition', layout: 'ru', completedText: true, errors: 0,
    correctChars: target!.length, transitionPairs: [{ from: 'а', to: 'о' }],
    transitions: { 'а->о': Array.from({ length: Math.min(occurrences, 24) }, () => 125) },
  })
})

test('после прохождения урока упражнение сохраняет пары из окна результата', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.clock.install({ time: new Date(noon - 60_000) })
  await page.clock.pauseAt(new Date(noon))
  await page.goto('/#/practice/ru-01')

  const target = (await page.getByTestId('typing-text').getAttribute('data-target'))!
  const firstF = target.indexOf('ф')
  expect(firstF).toBeGreaterThanOrEqual(0)
  const press = (key: string) => page.evaluate((input) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: input, bubbles: true }))
  }, key)
  for (const [index, key] of [...target].entries()) {
    if (index === firstF) {
      await press('а')
      await press('п')
      await press('п')
    }
    await press(key)
    await page.clock.runFor(75)
  }
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Урок пройден!' })).toBeVisible()
  await expect(dialog).toContainText('ф → а (1)')
  await expect(dialog).not.toContainText('ф → п')
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('klavish-state-v1')!) as AppState)
  expect(state.lessonProgress['ru-01'].completed).toBe(true)
  expect(state.sessions[0].confusions).toEqual({ 'ф->а': 1, 'ф->п': 2 })

  await dialog.getByRole('link', { name: 'Потренировать ошибки' }).click()
  await expect(page.getByRole('heading', { name: 'Тренировка сочетаний' })).toBeVisible()
  await expect(page.getByText('ф → а', { exact: true })).toBeVisible()
  await expect(page.getByTestId('typing-text')).not.toHaveAttribute('data-target', /п/)
})
