const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const path = require('node:path')
const { mkdirSync } = require('node:fs')
const fs = require('node:fs/promises')
const { pathToFileURL } = require('node:url')
const { DataStore } = require('./store.cjs')

const exportTitles = {
  en: ['Report for AI', 'Export %s'], ru: ['Отчёт для ИИ', 'Экспорт %s'],
  es: ['Informe para IA', 'Exportar %s'], fr: ['Rapport pour l’IA', 'Exporter au format %s'],
  de: ['Bericht für KI', '%s exportieren'], pt: ['Relatório para IA', 'Exportar %s'],
}

app.setName('klavish')
const devUrl = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL
const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
const entryUrl = new URL(devUrl || pathToFileURL(indexPath))
const dataDirOverride = process.env.KLAVISH_DATA_DIR
if (dataDirOverride) {
  const dataDir = path.resolve(dataDirOverride)
  mkdirSync(dataDir, { recursive: true })
  app.setPath('userData', dataDir)
}
const ownsProfile = app.requestSingleInstanceLock()
if (!ownsProfile) app.quit()

let store
let mainWindow

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

function isEntryUrl(rawUrl) {
  if (!URL.canParse(rawUrl)) return false
  const url = new URL(rawUrl)
  url.hash = ''
  return url.href === entryUrl.href
}

function trusted(event) {
  const frame = event.senderFrame
  if (event.sender === mainWindow?.webContents && frame?.parent === null && isEntryUrl(frame.url)) return
  throw new Error('Недоверенный источник IPC')
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#111512',
    title: 'takt..',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: Boolean(devUrl),
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isEntryUrl(url)) event.preventDefault()
  })
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  if (devUrl) await mainWindow.loadURL(entryUrl.href)
  else await mainWindow.loadFile(indexPath)
}

app.whenReady().then(async () => {
  if (!ownsProfile) return
  store = new DataStore(app.getPath('userData'))

  ipcMain.handle('store:load', async (event) => { trusted(event); return store.load() })
  ipcMain.handle('store:save', async (event, state, session) => { trusted(event); return store.save(state, session, app.getVersion()) })
  ipcMain.handle('store:clear', async (event, state) => { trusted(event); return store.clear(state) })
  ipcMain.handle('store:open-logs', async (event) => {
    trusted(event)
    await store.ensure()
    const error = await shell.openPath(store.logDirectory)
    if (error) throw new Error(error)
    return store.logDirectory
  })
  ipcMain.handle('store:export', async (event, format, content, purpose, language) => {
    trusted(event)
    if (!['json', 'csv'].includes(format) || typeof content !== 'string') throw new Error('Некорректный экспорт')
    const report = format === 'json' && purpose === 'progress'
    const [reportTitle, exportTitle] = Object.hasOwn(exportTitles, language) ? exportTitles[language] : exportTitles.en
    const result = await dialog.showSaveDialog(mainWindow, {
      title: report ? reportTitle : exportTitle.replace('%s', format.toUpperCase()),
      defaultPath: `takt-${report ? 'progress' : 'export'}-${new Date().toISOString().slice(0, 10)}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    })
    if (result.canceled || !result.filePath) return null
    await fs.writeFile(result.filePath, content, 'utf8')
    return result.filePath
  })
  ipcMain.handle('app:get-info', async (event) => {
    trusted(event)
    return { isDesktop: true, platform: process.platform, arch: process.arch, version: app.getVersion(), logDirectory: store.logDirectory }
  })

  await createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
