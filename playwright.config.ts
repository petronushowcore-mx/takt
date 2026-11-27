import { defineConfig } from '@playwright/test'

const browserExecutable = process.env.KLAVISH_TEST_BROWSER
const port = Number(process.env.KLAVISH_TEST_PORT ?? 7100)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Некорректный порт для тестов')
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  workers: 1,
  use: {
    baseURL,
    locale: 'ru-RU',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    launchOptions: browserExecutable ? { executablePath: browserExecutable } : {},
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --strictPort --port ${port}`,
    url: baseURL,
    stdout: 'pipe',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
