import { _electron as electron, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const executable = path.resolve(process.argv[2])
const expectedArch = process.argv[3]
const dataDir = path.resolve(`test-results/packaged-${expectedArch}-data`)
const env = { ...process.env, KLAVISH_DATA_DIR: dataDir }
delete env.ELECTRON_RUN_AS_NODE
let app
let createdProfile = false
try {
  await fs.mkdir(dataDir)
  createdProfile = true
  await fs.writeFile(path.join(dataDir, 'profile.json'), JSON.stringify({
    version: 1, profileId: 'packaged-smoke', createdAt: new Date().toISOString(),
    sessions: [], lessonProgress: {}, achievements: {},
    settings: { layout: 'ru', language: 'ru', sound: false, showKeyboard: true, lessonLength: 'normal', theme: 'waves' },
  }), { flag: 'wx' })
  app = await electron.launch({ executablePath: executable, args: [], env })
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: 'Пальцы запомнят дорогу.' }).waitFor()
  await expect(page).toHaveTitle('takt..')
  await expect(page.getByTestId('theme-backdrop')).toBeVisible()
  await page.getByRole('link', { name: 'Прогресс', exact: true }).click()
  const keyboard = page.getByRole('region', { name: 'Клавиатура и промахи' })
  await expect(keyboard.getByRole('button', { name: 'Отчёт для ИИ · JSON' })).toBeVisible()
  await keyboard.getByRole('link', { name: /Хардкор/ }).click()
  await expect(page.getByRole('heading', { name: 'Хардкор' })).toBeVisible()
  await expect(page.getByText(/четырьмя или более попытками/)).toBeVisible()
  await page.getByRole('link', { name: 'К статистике клавиатуры' }).click()
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const dark = page.getByRole('button', { name: 'Тёмная', exact: true })
  await dark.click()
  await expect(dark).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(dark).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('theme-backdrop')).toHaveCount(0)
  await page.getByTestId('interface-language').selectOption('en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.reload()
  await expect(page.getByTestId('interface-language')).toHaveValue('en')
  const info = await page.evaluate(() => window.klavish.getInfo())
  if (!info.isDesktop || info.arch !== expectedArch) throw new Error(`Неожиданная архитектура: ${JSON.stringify(info)}`)
  const errors = [...(await page.consoleMessages()).filter((message) => message.type() === 'error').map((message) => message.text()),
    ...(await page.pageErrors()).map((error) => error.message)]
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(`Packaged smoke OK: ${expectedArch}; ${info.platform}; takt.. ${info.version}; keyboard progress, report, Hardcore, theme, language switch; console errors: 0`)
} finally {
  if (app) await app.close()
  if (createdProfile) await fs.rm(dataDir, { recursive: true, force: true })
}
