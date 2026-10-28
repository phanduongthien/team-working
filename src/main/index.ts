import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, safeStorage, shell, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipc'
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_ASSISTANT,
  aiSettingsSchema,
  assistantProfileSchema,
  idSchema,
  type AiProviderId
} from '@shared/schemas'
import type { AIProvider } from './ai/AIProvider'
import { AnthropicApiProvider } from './ai/AnthropicApiProvider'
import { ClaudeCliProvider } from './ai/ClaudeCliProvider'
import { loadModeSkill, loadSkill } from './ai/skills'
import { openDatabase } from './db/client'
import {
  LOCAL_OWNER,
  ConversationRepository,
  MemoryRepository,
  MessageRepository,
  SettingsRepository,
  SuggestionRepository
} from './db/repositories'
import { CodeApprovals } from './code/approvals'
import { TimeRepository } from './db/timeRepository'
import { registerAppIpc } from './ipc/app'
import { createHandle, registerIpc } from './ipc/register'
import { startAutoUpdate } from './services/updater'
import { registerTeamIpc } from './ipc/team'
import { emitApproval, registerWorkIpc } from './ipc/work'
import { OAuthLoopback } from './services/oauthLoopback'
import { AccountScope } from './memory/accountScope'
import { MemoryService } from './memory/memoryService'
import { AttachmentStore } from './services/attachments'
import { ChatService } from './services/chatService'
import { createLogger } from './services/logger'
import { SecretStore } from './services/secrets'

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

async function bootstrap(): Promise<void> {
  const userData = app.getPath('userData')
  const workspaceDir = join(userData, 'workspace')
  mkdirSync(workspaceDir, { recursive: true })

  const { db, close } = openDatabase(
    join(userData, 'team-working.db'),
    resourcePath('migrations', 'src/main/db/migrations')
  )
  app.on('will-quit', close)

  const conversations = new ConversationRepository(db)
  const messages = new MessageRepository(db)
  // Trí nhớ cá nhân theo tài khoản đang đăng nhập (renderer báo qua account:set).
  let scope: AccountScope | null = null
  const getOwner = (): string => scope?.current ?? LOCAL_OWNER
  const memories = new MemoryRepository(db, getOwner)
  const suggestions = new SuggestionRepository(db, getOwner)
  const settings = new SettingsRepository(db)
  scope = new AccountScope({ memories, settings })
  const accountScope = scope
  const interrupted = messages.markInterrupted()
  if (interrupted) log.info(`Đánh dấu ${interrupted} tin nhắn bị gián đoạn`)

  const secrets = new SecretStore(join(userData, 'secrets'), safeStorage)

  // Chế độ Code: mỗi lần Claude muốn sửa file, app hiện diff để người dùng duyệt.
  const approvals = new CodeApprovals({
    writableRoot: (id) => {
      const conv = conversations.get(id)
      return conv && conv.mode === 'code' && conv.codeWrite && conv.cwd ? conv.cwd : null
    },
    emit: (request) => emitApproval(mainWindow, request),
    log
  })
  await approvals.start()
  app.on('before-quit', () => approvals.stop())
  const permissionScript = resourcePath('permission-mcp.cjs', 'resources/permission-mcp.cjs')

  const providers: Record<AiProviderId, AIProvider> = {
    'claude-cli': new ClaudeCliProvider(log, () => ({
      electronPath: process.execPath,
      script: permissionScript,
      url: approvals.url,
      token: approvals.token
    })),
    'anthropic-api': new AnthropicApiProvider(() => secrets.get())
  }
  const getProvider = (): AIProvider =>
    providers[settings.get('ai', aiSettingsSchema, DEFAULT_AI_SETTINGS).provider]

  const skillsDir = resourcePath('assistant-skills', 'assistant-skills')
  const memory = new MemoryService({
    conversations,
    messages,
    memories,
    suggestions,
    settings,
    getProvider,
    loadSkill: (name) => loadSkill(skillsDir, name),
    workspaceDir,
    emit: (payload) => mainWindow?.webContents.send(IPC.memoryEvent, payload),
    log,
    getOwner
  })
  const chat = new ChatService({
    conversations,
    messages,
    getProvider,
    getAssistant: () => settings.get('assistant', assistantProfileSchema, DEFAULT_ASSISTANT),
    getMemoryContext: (query) => memory.contextFor(query),
    loadModeSkill: (mode) => loadModeSkill(skillsDir, mode),
    workspaceDir,
    emit: (payload) => mainWindow?.webContents.send(IPC.chatEvent, payload),
    log,
    onRunEnd: (conversationId) => approvals.cancelConversation(conversationId)
  })
  app.on('before-quit', () => chat.abortAll())

  const handle = createHandle((event: IpcMainInvokeEvent) => event.sender === mainWindow?.webContents, log)
  const getWindow = (): BrowserWindow | null => mainWindow
  registerIpc({
    conversations,
    messages,
    memories,
    suggestions,
    settings,
    chat,
    memory,
    attachments: new AttachmentStore(join(workspaceDir, 'attachments')),
    secrets,
    log,
    getWindow,
    handle
  })
  const oauth = new OAuthLoopback()
  app.on('before-quit', () => oauth.cancel())
  registerTeamIpc({
    handle,
    oauth,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    getWindow,
    getProvider,
    loadSkill: (name) => loadSkill(skillsDir, name),
    workspaceDir,
    log
  })
  const updater = startAutoUpdate({ isPackaged: app.isPackaged, getWindow, log })
  registerAppIpc({
    handle,
    log,
    installUpdate: () => updater.install(),
    getProvider,
    loadSkill: (name) => loadSkill(skillsDir, name),
    workspaceDir
  })
  handle(IPC.accountSet, idSchema.nullable(), (uid) => {
    const result = accountScope.set(uid)
    if (result.claimed) log.info('Đã giao trí nhớ tạo trước khi đăng nhập cho tài khoản đầu tiên')
    memory.emitCount()
    return result
  })
  registerWorkIpc({
    handle,
    conversations,
    settings,
    time: new TimeRepository(db),
    approvals,
    memory,
    getProvider,
    loadSkill: (name) => loadSkill(skillsDir, name),
    workspaceDir,
    getWindow,
    log
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
  app.setAppUserModelId('com.phanduongthien.teamworking')
  void app.whenReady().then(async () => {
    try {
      await bootstrap()
    } catch (err) {
      const message = (err as Error).stack ?? String(err)
      log.error(`Khởi động thất bại: ${message}`)
      dialog.showErrorBox('Team Working', `${(err as Error).message}\n\nLog: ${log.file}`)
      app.quit()
    }
  })
  app.on('window-all-closed', () => app.quit())
}
