import { _electron as electron } from '@playwright/test'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'takt-electron-smoke-'))
const outputDir = path.join(root, 'test-results', 'electron')
await fs.mkdir(outputDir, { recursive: true })
const electronEnv = { ...process.env, KLAVISH_DATA_DIR: dataDir }
delete electronEnv.ELECTRON_RUN_AS_NODE
async function assertRendererClean(page, phase) {
  const [consoleMessages, pageErrors] = await Promise.all([page.consoleMessages(), page.pageErrors()])
  const errors = [
    ...consoleMessages.filter((message) => message.type() === 'error').map((message) => message.text()),
    ...pageErrors.map((error) => error.message),
  ]
  if (errors.length) throw new Error(phase + ': ошибки консоли\n' + errors.join('\n'))
}

let app
try {
  await fs.writeFile(path.join(dataDir, 'profile.json'), JSON.stringify({
    version: 1, profileId: 'electron-smoke', createdAt: new Date().toISOString(),
    sessions: [], lessonProgress: {}, achievements: {},
    settings: { layout: 'ru', language: 'ru', sound: false, showKeyboard: true, lessonLength: 'normal', theme: 'waves' },
  }), { flag: 'wx' })
  app = await electron.launch({ args: ['.'], cwd: root, env: electronEnv })
  const page = await app.firstWindow()
  await page.getByRole('link', { name: /Начать урок/ }).click()
  const blockedProfileTemp = path.join(dataDir, 'profile.json.tmp')
  await fs.mkdir(blockedProfileTemp)
  const target = await page.getByTestId('typing-text').getAttribute('data-target')
  await page.evaluate(async (text) => {
    for (const char of text) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 15))
    }
  }, target)
  await page.getByRole('button', { name: 'Повторить сохранение' }).waitFor()
  await assertRendererClean(page, 'Блокировка записи результата')
  await app.close()
  app = undefined
  await fs.rmdir(blockedProfileTemp)
  app = await electron.launch({ args: ['.'], cwd: root, env: electronEnv })
  const reopened = await app.firstWindow()
  await reopened.getByRole('heading', { name: 'Продолжим вырабатывать ритм.' }).waitFor()
  await reopened.screenshot({ path: path.join(outputDir, 'electron-result.png'), fullPage: true })
  const profile = JSON.parse(await fs.readFile(path.join(dataDir, 'profile.json'), 'utf8'))
  if (profile.sessions.length !== 1) throw new Error('Профиль не сохранил тренировку')
  const saved = profile.sessions[0]
  if (saved.correctChars !== target.length) throw new Error('Профиль не сохранил полный результат набора')
  const logsDir = path.join(dataDir, 'logs')
  const files = (await fs.readdir(logsDir)).filter((file) => file.endsWith('.jsonl'))
  if (files.length !== 1) throw new Error('JSONL-файл не создан')
  const event = JSON.parse((await fs.readFile(path.join(logsDir, files[0]), 'utf8')).trim())
  if (event.schema !== 'klavish.event.v1' || event.data.id !== saved.id || event.data.correctChars !== saved.correctChars) {
    throw new Error('JSONL не совпадает с профилем')
  }
  const { stdout } = await exec(process.execPath, [path.join(root, 'tools', 'analyze-progress.mjs'), logsDir, '--out', outputDir])
  const report = JSON.parse(await fs.readFile(path.join(outputDir, 'progress-report.json'), 'utf8'))
  if (report.summary.sessions !== 1 || report.summary.correctChars !== saved.correctChars) throw new Error('Анализатор не прочитал полный результат')

  await fs.mkdir(blockedProfileTemp)
  await reopened.getByRole('link', { name: 'Настройки', exact: true }).click()
  await reopened.getByRole('button', { name: 'Сбросить данные' }).click()
  await reopened.getByRole('button', { name: 'Удалить прогресс' }).click()
  await reopened.getByText('Не удалось сбросить прогресс.', { exact: true }).waitFor()
  await assertRendererClean(reopened, 'Открытие после ошибки записи и блокировка сброса')
  await app.close()
  app = undefined

  app = await electron.launch({ args: ['.'], cwd: root, env: electronEnv })
  const afterBlockedReset = await app.firstWindow()
  await afterBlockedReset.getByRole('heading', { name: 'Продолжим вырабатывать ритм.' }).waitFor()
  await assertRendererClean(afterBlockedReset, 'Открытие после ошибки сброса')
  await app.close()
  app = undefined
  await fs.rmdir(blockedProfileTemp)

  app = await electron.launch({ args: ['.'], cwd: root, env: electronEnv })
  const afterReset = await app.firstWindow()
  await afterReset.getByRole('heading', { name: 'Пальцы запомнят дорогу.' }).waitFor()
  const cleared = JSON.parse(await fs.readFile(path.join(dataDir, 'profile.json'), 'utf8'))
  if (cleared.sessions.length || cleared.profileId !== profile.profileId || (await fs.readdir(logsDir)).length) {
    throw new Error('Сброс не завершился после устранения препятствия')
  }
  await assertRendererClean(afterReset, 'Открытие после завершённого сброса')
  console.log(stdout)
  console.log(`Electron smoke OK: full result recovered in profile, JSONL and analyzer; blocked reset left profile readable and resumed after reopening; ${saved.correctChars} знаков; ошибок консоли: 0`)
} finally {
  if (app) await app.close()
  await fs.rm(dataDir, { recursive: true, force: true })
}
