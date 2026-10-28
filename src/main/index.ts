import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, shell, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipc'
import { DEFAULT_ASSISTANT, assistantProfileSchema } from '@shared/schemas'
import { ClaudeCliProvider } from './ai/ClaudeCliProvider'
import { loadModeSkill } from './ai/skills'
import { openDatabase } from './db/client'
import { ConversationRepository, MessageRepository, SettingsRepository } from './db/repositories'
import { registerIpc } from './ipc/register'
import { ChatService } from './services/chatService'
import { createLogger } from './services/logger'

/** Tài nguyên đóng gói (extraResources) khi đã build, thư mục nguồn khi dev. */
function resourcePath(packaged: string, dev: string): string {
  return app.isPackaged ? join(process.resourcesPath, packaged) : join(app.getAppPath(), dev)
}

// Test e2e dùng thư mục dữ liệu riêng để không đụng dữ liệu thật của người dùng.
if (process.env.TEAM_WORKING_USER_DATA) app.setPath('userData', process.env.TEAM_WORKING_USER_DATA)

const log = createLogger(join(app.getPath('userData'), 'logs'))
let mainWindow: BrowserWindow | null = null

process.on('uncaughtException', (err) => log.error(`uncaughtException: ${err.stack ?? err.message}`))
process.on('unhandledRejection', (reason) => log.error(`unhandledRejection: ${String(reason)}`))

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Team Working',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.on('ready-to-show', () => win.show())

  // Link ngoài mở bằng trình duyệt; không cho mở cửa sổ mới hay điều hướng khỏi app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function bootstrap(): void {
  const userData = app.getPath('userData')
  const workspaceDir = join(userData, 'workspace')
  mkdirSync(workspaceDir, { recursive: true })

  const { db, close } = openDatabase(join(userData, 'team-working.db'), resourcePath('migrations', 'src/main/db/migrations')
  )
  app.on('will-quit', close)

  const conversations = new ConversationRepository(db)
  const messages = new MessageRepository(db)
  const settings = new SettingsRepository(db)
  const interrupted = messages.markInterrupted()
  if (interrupted) log.info(`Đánh dấu ${interrupted} tin nhắn bị gián đoạn`)

  const skillsDir = resourcePath('assistant-skills', 'assistant-skills')
  const chat = new ChatService({
    conversations,
    messages,
    provider: new ClaudeCliProvider(log),
    getAssistant: () => settings.get('assistant', assistantProfileSchema, DEFAULT_ASSISTANT),
    loadModeSkill: (mode) => loadModeSkill(skillsDir, mode),
    workspaceDir,
    emit: (payload) => mainWindow?.webContents.send(IPC.chatEvent, payload),
    log
  })
  app.on('before-quit', () => chat.abortAll())

  registerIpc({
    conversations,
    messages,
    settings,
    chat,
    log,
    isTrustedSender: (event: IpcMainInvokeEvent) => event.sender === mainWindow?.webContents
  })

  mainWindow = createWindow()
  log.info(`Khởi động Team Working ${app.getVersion()}`)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })
  app.setAppUserModelId('com.youragent.teamworking')
  void app.whenReady().then(() => {
    try {
      bootstrap()
    } catch (err) {
      const message = (err as Error).stack ?? String(err)
      log.error(`Khởi động thất bại: ${message}`)
      dialog.showErrorBox('Team Working', `${(err as Error).message}\n\nLog: ${log.file}`)
      app.quit()
    }
  })
  app.on('window-all-closed', () => app.quit())
}
