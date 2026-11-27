import { expect, test } from '@playwright/test'
import type { AppState } from '../../src/types'

async function typeText(page: import('@playwright/test').Page, text: string) {
  await page.evaluate(async (value) => {
    for (const char of value) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 12))
    }
  }, text)
}

test('основной путь: урок, ошибка, результат, статистика и экспорт', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.location().url} ${message.text()}`.trim()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Пальцы запомнят дорогу.' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('home-empty.png'), fullPage: true })
  await page.getByRole('link', { name: /Начать урок/ }).click()
  const target = await page.getByTestId('typing-text').getAttribute('data-target')
  expect(target).toBeTruthy()
  const wrong = target![0].toLocaleLowerCase() === 'x' ? 'z' : 'x'
  await page.evaluate((key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })), wrong)
  await expect(page.locator('.error-feedback')).toBeVisible()
  await expect(page.locator('.finger-legend span')).toHaveCount(8)
  await page.screenshot({ path: testInfo.outputPath('practice-fingers.png'), fullPage: true })
  const start = await page.evaluate(async (text) => {
    for (let index = 0; index < text.length; index += 1) {
      if (document.querySelector('.typing-stage .start-hint')?.textContent?.includes('Этап 2 из 3')) return index
      window.dispatchEvent(new KeyboardEvent('keydown', { key: text[index], bubbles: true }))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    return -1
  }, target!)
  expect(start).toBeGreaterThan(0)
  await page.evaluate((key) => {
    for (let index = 0; index < 15; index += 1) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  }, wrong)
  await typeText(page, target!.slice(start))
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Хорошая попытка')).toBeVisible()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('klavish-state-v1')!).sessions)
  expect(saved).toHaveLength(1)
  expect(saved[0].errors).toBe(16)
  expect(saved[0].lessonScored.errors).toBe(15)
  expect(saved[0].keyStats).toBeTruthy()
  await page.getByRole('button', { name: 'К урокам' }).click()
  await page.getByRole('link', { name: 'Прогресс', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Как растёт ваш навык' })).toBeVisible()
  await expect(page.locator('tbody tr').first()).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт CSV' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.csv$/)
  await page.screenshot({ path: testInfo.outputPath('stats.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('частичный урок сохраняет чистый прогресс и не открывает следующий', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Начать урок/ }).click()
  const firstLesson = page.url()
  const secondLesson = firstLesson.replace('ru-01', 'ru-02')
  await page.goto(secondLesson)
  await expect(page.getByRole('heading', { name: 'Урок пока закрыт' })).toBeVisible()
  await page.goto(firstLesson)
  const target = await page.getByTestId('typing-text').getAttribute('data-target')
  await typeText(page, target!.slice(0, 5))
  await page.keyboard.press('Backspace')
  await typeText(page, target![4])
  await page.getByRole('button', { name: 'Завершить', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Для перехода наберите весь текст')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('klavish-state-v1')!))
  expect(saved.sessions[0]).toMatchObject({ correctChars: 5, totalKeys: 6, accuracy: 100, backspaces: 1, completedText: false })
  expect(saved.lessonProgress['ru-01'].completed).toBe(false)
  await page.goto(secondLesson)
  await expect(page.getByRole('heading', { name: 'Урок пока закрыт' })).toBeVisible()
})

test('все разделы и настройки доступны, аркады запускаются', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  for (const item of ['Уроки', 'Аркады', 'Прогресс', 'Достижения']) {
    await page.getByRole('link', { name: item, exact: true }).click()
    await expect(page.locator('h1').first()).toBeVisible()
  }
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const sound = page.getByRole('switch', { name: /Звук ошибки|Включён|Выключён/ }).last()
  await sound.click()
  await expect(sound).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('link', { name: 'Аркады', exact: true }).click()
  await page.getByRole('link', { name: 'Запустить' }).first().click()
  await page.getByRole('button', { name: 'Начать раунд' }).click()
  await expect(page.locator('.falling-word').first()).toBeVisible({ timeout: 5000 })
  const word = await page.locator('.falling-word kbd').first().textContent()
  await typeText(page, word!)
  await expect(page.locator('.game-hud').getByText(/\d+/).first()).not.toHaveText('0')
  await page.screenshot({ path: testInfo.outputPath('orbit.png'), fullPage: true })
  await page.getByRole('link', { name: 'Вернуться к аркадам' }).click()
  await page.getByRole('link', { name: 'Запустить' }).nth(1).click()
  await page.getByRole('button', { name: 'Начать спринт' }).click()
  const sprintTarget = page.locator('.sprint-target')
  await expect(sprintTarget).toHaveText(/^\S+$/)
  const target = await sprintTarget.innerText()
  await expect(sprintTarget).toHaveAttribute('aria-label', 'Текущее слово: ' + target)
  await typeText(page, target + ' ')
  await expect(page.locator('.game-hud').getByText(/\d+/).first()).not.toHaveText('0')
  expect(errors).toEqual([])
})

test('локальный профиль и назначенный темп переживают быстрый повтор и перезагрузку', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  await page.getByLabel('Имя профиля').fill('Кики')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('klavish-state-v1') || '{}').settings?.profileName)).toBe('Кики')
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Кики', exact: true })).toBeVisible()
  await page.getByRole('link', { name: /Начать урок/ }).click()

  const text = page.getByTestId('typing-text')
  const dialog = page.getByRole('dialog')
  const next = page.getByRole('button', { name: 'Следующий урок' })
  const loadProfile = () => page.evaluate(() => JSON.parse(localStorage.getItem('klavish-state-v1')!) as AppState)
  const target = (await text.getAttribute('data-target'))!
  const measuredStart = await page.evaluate(() => Date.now()) + 1000
  await page.clock.pauseAt(measuredStart)
  for (const [index, char] of [...target].entries()) {
    await page.clock.setSystemTime(measuredStart + index * 750)
    await page.evaluate((key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })), char)
  }
  await page.clock.resume()
  await expect(dialog).toContainText('Следующая цель — 16.8 сл/мин')
  const first = await loadProfile()
  expect(first.sessions[0]).toMatchObject({ completedText: true, targetWpm: 16, accuracy: 100 })
  expect(first.sessions[0].wpm).toBeGreaterThanOrEqual(16)
  expect(first.sessions[0].wpm).toBeLessThan(16.8)
  expect(first.lessonProgress['ru-02']).toMatchObject({ targetWpm: 16.8, increasePercent: 5 })

  await next.click()
  await expect(page).toHaveURL(/ru-02$/)
  await expect(text.locator('.is-done')).toHaveCount(0)
  await expect(page.getByText('Цель 16.8 сл/мин', { exact: false })).toBeVisible()
  await page.goto('/#/practice/ru-01')
  await expect(page.getByText('Цель 16 сл/мин', { exact: false })).toBeVisible()
  await typeText(page, (await text.getAttribute('data-target'))!)
  await expect(dialog).toContainText('Следующая цель — 16.8 сл/мин')
  const replay = await loadProfile()
  expect(replay.sessions[1]).toMatchObject({ completedText: true, targetWpm: 16, accuracy: 100 })
  expect(replay.sessions[1].wpm).toBeGreaterThanOrEqual(17.6)

  await next.click()
  await expect(page).toHaveURL(/ru-02$/)
  await page.reload()
  await expect(page.getByText('Цель 16.8 сл/мин', { exact: false })).toBeVisible()
  await typeText(page, (await text.getAttribute('data-target'))!.slice(0, 8))
  await page.getByRole('button', { name: 'Завершить', exact: true }).click()
  await expect(dialog).toContainText('Хорошая попытка')
  const reopened = await loadProfile()
  expect(reopened.settings.profileName).toBe('Кики')
  expect(reopened.sessions[2]).toMatchObject({ lessonId: 'ru-02', completedText: false, targetWpm: 16.8 })
  expect(reopened.lessonProgress['ru-02']).toMatchObject({ targetWpm: 16.8, increasePercent: 5 })
})

test('тема сохраняется в прежнем профиле и действует на всех экранах', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const key = 'klavish-state-v1'
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      profileId: 'existing-profile',
      createdAt: '2026-01-01T12:00:00.000Z',
      sessions: [],
      lessonProgress: { 'ru-02': { targetWpm: 18.4, increasePercent: 15 } },
      achievements: {},
      settings: { layout: 'ru', profileName: 'Кики' },
    }))
  })
  await page.goto('/#/settings')
  await expect(page).toHaveTitle('takt..')
  const logoStroke = page.getByRole('img', { name: 'takt..', exact: true }).locator('path')
  await expect(logoStroke).not.toHaveCSS('stroke', 'none')
  await expect(page.getByRole('heading', { name: 'takt..', exact: true })).toBeVisible()
  await expect(page.getByLabel('Имя профиля')).toHaveValue('Кики')
  const options = page.getByRole('group', { name: 'Тема оформления' })
  const waves = options.getByRole('button', { name: 'Топологические волны' })
  const dark = options.getByRole('button', { name: 'Тёмная' })
  const backdrop = page.getByTestId('theme-backdrop')
  const frame = page.locator('.theme-frame')

  await expect(waves).toHaveAttribute('aria-pressed', 'true')
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true')
  await dark.click()
  await expect(frame).toHaveAttribute('data-theme', 'dark')
  await expect(backdrop).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    return JSON.parse(localStorage.getItem('klavish-state-v1')!).settings.theme
  })).toBe('dark')
  await page.goto('/#/practice/ru-01')
  await expect(page.locator('.practice-page')).toBeVisible()
  await expect(frame).toHaveAttribute('data-theme', 'dark')
  await expect(backdrop).toHaveCount(0)

  await page.goto('/#/settings')
  await expect(dark).toHaveAttribute('aria-pressed', 'true')
  await waves.click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('klavish-state-v1')!))).toMatchObject({
    profileId: 'existing-profile',
    settings: { profileName: 'Кики', theme: 'waves' },
    lessonProgress: { 'ru-02': { targetWpm: 18.4, increasePercent: 15 } },
  })
  await page.goto('/#/practice/ru-01')
  await expect(page.locator('.practice-page')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(backdrop).toBeVisible()
  await page.goto('/#/arcade/sprint')
  await expect(page.locator('.sprint-page')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(backdrop).toBeVisible()
  await expect.poll(() => backdrop.evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 35 && pixels[index] > pixels[index + 1] && pixels[index + 1] > pixels[index + 2] * 1.6) return true
    }
    return false
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('takt-waves.png'), fullPage: true })
})

test('неудачный сброс в браузере сохраняет профиль и прогресс до повторной записи', async ({ page }) => {
  const profile: AppState = {
    version: 1,
    profileId: 'reset-test',
    createdAt: '2026-01-01T12:00:00Z',
    sessions: [{
      schemaVersion: 1, id: 'first-lesson', startedAt: '2026-01-01T12:00:30Z', endedAt: '2026-01-01T12:02:00Z',
      mode: 'lesson', layout: 'ru', lessonId: 'ru-01', level: 1, completedText: true, targetWpm: 16,
      activeMs: 90000, wallMs: 90000, totalKeys: 150, correctChars: 150, errors: 0, backspaces: 0,
      bestStreak: 150, cpm: 100, wpm: 20, accuracy: 100, meanLatencyMs: 600, p95LatencyMs: 600,
      score: 1000, keyStats: {}, confusions: {}, samples: [],
    }],
    lessonProgress: { 'ru-01': { completed: true, attempts: 1, bestWpm: 20, bestAccuracy: 100, targetWpm: 16 } },
    achievements: { first: '2026-01-01T12:02:00Z' },
    settings: { layout: 'ru', profileName: 'Кики', theme: 'dark', sound: false, showKeyboard: true, lessonLength: 'normal' },
  }
  await page.addInitScript((initialProfile) => {
    const key = 'klavish-state-v1'
    const original = Storage.prototype.setItem
    original.call(localStorage, key, JSON.stringify(initialProfile))
    let failReset = true
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key && failReset && !Object.keys(JSON.parse(value).lessonProgress).length) {
        failReset = false
        throw new DOMException('Тестовый отказ записи', 'QuotaExceededError')
      }
      original.call(this, name, value)
    }
  }, profile)
  await page.goto('/#/settings')
  await expect(page.getByLabel('Имя профиля')).toHaveValue('Кики')
  const savedState = () => page.evaluate(() => JSON.parse(localStorage.getItem('klavish-state-v1')!))
  const reset = async () => {
    await page.getByRole('button', { name: 'Сбросить данные' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить прогресс' }).click()
  }

  await reset()
  await expect(page.getByText('Не удалось сбросить прогресс.', { exact: true })).toBeVisible()
  expect(await savedState()).toEqual(profile)
  await reset()
  await expect(page.getByText('Прогресс сброшен', { exact: true })).toBeVisible()
  expect(await savedState()).toEqual({
    ...profile, sessions: [], lessonProgress: {}, achievements: {}, settings: { ...profile.settings, language: 'ru' },
  })
})

test('адаптивная вёрстка не создаёт горизонтальный скролл', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport)
  await page.screenshot({ path: testInfo.outputPath('mobile-home.png'), fullPage: true })
  await page.getByRole('navigation', { name: 'Мобильная навигация' }).getByRole('link', { name: 'Настройки' }).click()
  await expect(page.getByRole('group', { name: 'Тема оформления' })).toBeVisible()
})


test('аркады учитывают подтверждённые слова и повторяют сохранение той же сессии', async ({ page }) => {
  test.setTimeout(90000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    const blocked = new Set(['orbit', 'sprint'])
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'klavish-state-v1') {
        const proposed = JSON.parse(value).sessions?.at(-1)
        if (proposed && blocked.delete(proposed.mode)) {
          original.call(sessionStorage, 'failed-round-' + proposed.mode, JSON.stringify(proposed))
          throw new DOMException('Тестовый отказ записи результата', 'QuotaExceededError')
        }
      }
      original.call(this, key, value)
    }
  })
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('link', { name: 'Аркады', exact: true }).click()

  const typeCorrectedWord = async (text: string) => {
    await page.evaluate((keys) => {
      for (const key of keys) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    }, ['Backspace', text[0], 'Backspace', ...text])
  }
  const savedFor = (mode: string) => page.evaluate((roundMode) => {
    const state = JSON.parse(localStorage.getItem('klavish-state-v1') ?? '{"sessions":[]}')
    return state.sessions.filter((item: { mode: string }) => item.mode === roundMode)
  }, mode)
  const checkRecovery = async (mode: string, committed: number, earlyErrors = 0) => {
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Результат не удалось записать в журнал.')
    expect(await savedFor(mode)).toEqual([])
    const failed = await page.evaluate((roundMode) =>
      JSON.parse(sessionStorage.getItem('failed-round-' + roundMode) ?? 'null'), mode)
    const totalKeys = committed + 2 + earlyErrors
    expect(failed).toMatchObject({
      id: expect.any(String), mode, correctChars: committed, totalKeys,
      backspaces: 1, errors: earlyErrors, accuracy: Math.round((totalKeys - earlyErrors) / totalKeys * 1000) / 10,
      bestStreak: committed + 1,
    })
    expect(failed.confusions).toEqual({})
    await dialog.getByRole('button', { name: 'Повторить сохранение', exact: true }).click()
    await expect(dialog).toContainText('Результат добавлен')
    expect(await savedFor(mode)).toEqual([failed])
  }

  await page.getByRole('link', { name: 'Запустить' }).first().click()
  await page.getByRole('button', { name: 'Начать раунд' }).click()
  await typeText(page, 'ъ')
  await page.clock.runFor(500)
  const orbitTarget = page.locator('.falling-word kbd').first()
  await expect(orbitTarget).toHaveText(/^\S+$/)
  const orbitWord = await orbitTarget.innerText()
  await typeCorrectedWord(orbitWord)
  await page.clock.runFor(2500)
  await expect(orbitTarget).toHaveText(/^\S{2,}$/)
  await typeText(page, (await orbitTarget.innerText())[0])
  await page.clock.runFor(61000)
  await checkRecovery('orbit', orbitWord.length, 1)

  await page.getByRole('button', { name: 'К аркадам' }).click()
  await page.getByRole('link', { name: 'Запустить' }).nth(1).click()
  await page.getByRole('button', { name: 'Начать спринт' }).click()
  const sprintTarget = page.locator('.sprint-target')
  const sprintNext = page.locator('.word-queue span').first()
  await expect(sprintTarget).toHaveText(/^\S+$/)
  await expect(sprintNext).toHaveText(/^\S{2,}$/)
  const sprintWord = await sprintTarget.innerText()
  const pendingWord = await sprintNext.innerText()
  await typeCorrectedWord(sprintWord + ' ')
  await typeText(page, pendingWord[0])
  await page.clock.runFor(61000)
  await checkRecovery('sprint', sprintWord.length + 1)
})


test('Орбита связывает ошибку только с однозначным продолжением', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.goto('/#/arcade')
  const round = async (picks: number[], words: string[], firstFrameMs: number) => {
    await page.getByRole('link', { name: 'Запустить' }).first().click()
    await page.evaluate((wordPicks) => {
      let calls = 0
      Math.random = () => {
        const call = calls++
        return call % 3 === 0 ? wordPicks[Math.floor(call / 3) % wordPicks.length] : 0.5
      }
    }, picks)
    await page.getByRole('button', { name: 'Начать раунд' }).click()
    await page.clock.runFor(firstFrameMs)
    await expect(page.locator('.falling-word kbd')).toHaveText(words)
    await typeText(page, 'ъка')
    await typeText(page, 'код')
    await page.clock.runFor(61000)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Результат добавлен')
    const saved = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('klavish-state-v1')!) as AppState
      return state.sessions.at(-1)!
    })
    expect(saved).toMatchObject({ mode: 'orbit', correctChars: 3, errors: 2, totalKeys: 6 })
    expect(saved.keyStats['ъ']).toBeUndefined()
    await dialog.getByRole('button', { name: 'К аркадам', exact: true }).click()
    return saved
  }

  // Word picks target «код» and «клавиша» in the Russian game dictionary.
  const unique = await round([1.5 / 24], ['код'], 500)
  expect(unique.confusions).toEqual({ 'о->а': 1 })
  expect(unique.keyStats['о'].errors).toBe(1)
  const ambiguous = await round([1.5 / 24, 6.5 / 24], ['код', 'клавиша'], 3150)
  expect(ambiguous.confusions).toEqual({})
  expect(ambiguous.keyStats['о'].errors).toBe(0)
  expect(ambiguous.keyStats['л']).toBeUndefined()
})

test('стартовая страница укладывается в бюджет загрузки и отрисовки', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  const metrics = await page.evaluate(async () => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const frames = await new Promise<number>((resolve) => {
      let count = 0
      const started = performance.now()
      const tick = () => {
        count += 1
        if (performance.now() - started >= 500) resolve(count * 2)
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    return {
      loadMs: Math.round(navigation.loadEventEnd - navigation.startTime),
      requests: resources.length,
      decodedBytes: resources.reduce((sum, item) => sum + item.decodedBodySize, 0),
      fps: frames,
    }
  })
  console.log(`Performance: ${metrics.loadMs} ms; ${metrics.requests} requests; ${Math.round(metrics.decodedBytes / 1024)} KiB decoded; ${metrics.fps} fps`)
  expect(metrics.loadMs).toBeLessThan(5000)
  expect(metrics.requests).toBeLessThan(100)
  expect(metrics.fps).toBeGreaterThan(30)
})
