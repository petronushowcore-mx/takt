import { expect, test } from '@playwright/test'

test('changes all six interface languages and keeps a legacy profile and its keyboard layout', async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'klavish-state-v1'
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, JSON.stringify({
      version: 1, profileId: 'locale-legacy', createdAt: new Date().toISOString(), sessions: [],
      lessonProgress: {}, achievements: {},
      settings: { profileName: 'Locale', layout: 'ru', theme: 'waves', sound: false, showKeyboard: true, lessonLength: 'short' },
    }))
  })
  await page.goto('/#/settings')
  const language = page.getByTestId('interface-language')
  await expect(language).toHaveValue('ru')
  for (const [locale, title] of [
    ['en', /Settings/], ['es', /Ajustes|Configuración/], ['fr', /Paramètres|Réglages/],
    ['de', /Einstellungen/], ['pt', /Definições|Configurações|Ajustes/], ['ru', /Настройки/],
  ] as const) {
    await language.selectOption(locale)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  }
  await language.selectOption('en')
  await page.reload()
  await expect(language).toHaveValue('en')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('klavish-state-v1')!))
  expect(saved).toMatchObject({ profileId: 'locale-legacy', settings: { language: 'en', layout: 'ru' } })
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: 'Your fingers will find the way.' })).toBeVisible()
})

test.describe('fresh profile', () => {
  test.use({ locale: 'es-ES' })

  test('starts in the supported browser language', async ({ page }) => {
    await page.goto('/#/settings')
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.getByTestId('interface-language')).toHaveValue('es')
  })
})
