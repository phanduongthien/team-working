import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  net,
  Notification,
  safeStorage,
  screen,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import { is } from '@electron-toolkit/utils'
import { z } from 'zod'
import { APP_NAME, LEGACY_USER_DATA_DIR } from '@shared/appConfig'
import { IPC } from '@shared/ipc'
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_UPDATE_SETTINGS,
  updateSettingsSchema,
  type UpdateSettings,
  aiSettingsSchema,
  computerUseSettingsSchema,
  DEFAULT_COMPUTER_USE_SETTINGS,
  idSchema,
  type AiProviderId
} from '@shared/schemas'
import type { AIProvider } from './ai/AIProvider'
import { AnthropicApiProvider } from './ai/AnthropicApiProvider'
import { ClaudeCliProvider } from './ai/ClaudeCliProvider'
import { loadModeSkill, loadSkill } from './ai/skills'
import { backupBeforeUpgrade } from './db/backup'
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
import { ActionLog } from './computer/actionLog'
import { electronCapture, fakeCapture } from './computer/electronCapture'
import { ComputerUseService } from './computer/service'
import { pythonCommand, SidecarClient } from './sidecar/client'
import { SidecarInstaller } from './sidecar/installer'
import { extractZip, runProcess } from './sidecar/process'
import { registerComputerIpc } from './ipc/computer'
import { ToolBridge } from './tools/bridge'
import { AppToolRegistry } from './tools/registry'
import { TimeRepository } from './db/timeRepository'
import { registerAppIpc } from './ipc/app'
import { createHandle, registerIpc } from './ipc/register'
import { createElectronUpdater } from './services/updater'
import { UpdateController } from './update/controller'
import { registerTeamIpc } from './ipc/team'
import { emitApproval, registerWorkIpc } from './ipc/work'
import { OAuthLoopback } from './services/oauthLoopback'
import { AccountScope } from './memory/accountScope'
import { MemoryService } from './memory/memoryService'
import { AttachmentStore } from './services/attachments'
import { ChatService } from './services/chatService'
import { createLogger } from './services/logger'
import { SavedAccountStore } from './services/savedAccounts'
import { SecretStore } from './services/secrets'

// Phải chạy trước mọi thứ dùng userData (single-instance lock, log, safeStorage, DB). Không module nào
// được đọc app.getPath('userData') lúc import, vì import chạy trước dòng này.
// Test e2e dùng thư mục dữ liệu riêng để không đụng dữ liệu thật của người dùng; còn lại giữ thư mục
// cũ sau khi đổi productName (mặc định Electron sẽ chuyển sang %APPDATA%/<productName>).
app.setPath(
  'userData',
  process.env.TEAM_WORKING_USER_DATA || join(app.getPath('appData'), LEGACY_USER_DATA_DIR)
)

/** Tài nguyên đóng gói (extraResources) khi đã build, thư mục nguồn khi dev. */
function resourcePath(packaged: string, dev: string): string {
  return app.isPackaged ? join(process.resourcesPath, packaged) : join(app.getAppPath(), dev)
}

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
    title: APP_NAME,
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

  const dbFile = join(userData, 'team-working.db')
  // Lần đầu chạy phiên bản mới (sau khi cập nhật): sao lưu DB trước khi migration chạy.
  await backupBeforeUpgrade({ dbFile, backupDir: join(userData, 'backups'), version: app.getVersion(), log })
  const { db, close } = openDatabase(
    dbFile,
    resourcePath('migrations', 'src/main/db/migrations')
  )
  app.on('will-quit', close)

  // Dữ liệu cá nhân (chat, trí nhớ, hồ sơ, trợ lý) theo tài khoản đang đăng nhập (renderer báo qua account:set).
  let scope: AccountScope | null = null
  const getOwner = (): string => scope?.current ?? LOCAL_OWNER
  const conversations = new ConversationRepository(db, getOwner)
  const messages = new MessageRepository(db)
  const memories = new MemoryRepository(db, getOwner)
  const suggestions = new SuggestionRepository(db, getOwner)
  const settings = new SettingsRepository(db)
  scope = new AccountScope({ memories, conversations, settings })
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

  // Tool của app cho Claude (MCP `mmc`): hiện có chụp màn hình (điều khiển máy tính — chỉ xem).
  const tools = new AppToolRegistry()
  const toolBridge = new ToolBridge(tools)
  await toolBridge.start()
  app.on('before-quit', () => toolBridge.stop())
  const appToolsScript = resourcePath('app-tools-mcp.cjs', 'resources/app-tools-mcp.cjs')

  const actionsDir = join(userData, 'logs', 'computer-use')
  const actions = new ActionLog(actionsDir)
  void actions.prune().catch((err: Error) => log.warn(`Không dọn được log điều khiển máy tính: ${err.message}`))
  // Màn hình giả chỉ cho bản chưa đóng gói (test e2e) — không bao giờ có trong bản phát hành.
  const fakeScreen = app.isPackaged ? undefined : process.env.MMC_FAKE_SCREEN

  // Python sidecar (đọc cửa sổ / cây UI): chỉ tải khi người dùng bấm cài, nằm trong thư mục dữ liệu app.
  const devOverride = (name: string): string | undefined => (app.isPackaged ? undefined : process.env[name] || undefined)
  const sidecarInstaller = new SidecarInstaller({
    root: join(userData, 'sidecar'),
    requirementsFile: resourcePath('sidecar/requirements.txt', 'resources/sidecar/requirements.txt'),
    uvUrl: devOverride('MMC_SIDECAR_UV_URL'),
    fetch: (url, init) => net.fetch(url, init),
    run: runProcess,
    extractZip,
    emit: (state) => mainWindow?.webContents.send(IPC.sidecarStateEvent, state),
    log
  })
  void sidecarInstaller.refresh()
  const sidecarScript = resourcePath('sidecar/desktop_server.py', 'resources/sidecar/desktop_server.py')
  const sidecarClient = new SidecarClient({
    command: () =>
      sidecarInstaller.state.state === 'installed' ? pythonCommand(sidecarInstaller.paths.venvPython, sidecarScript) : null,
    log
  })
  app.on('before-quit', () => {
    sidecarClient.stop()
    sidecarInstaller.cancel()
  })
  const appLogRoot = devOverride('MMC_APP_LOG_ROOT')
  let lastStopAt = 0
  const computer = new ComputerUseService({
    getSettings: () => settings.get('computerUse', computerUseSettingsSchema, DEFAULT_COMPUTER_USE_SETTINGS),
    setSettings: (value) => settings.set('computerUse', value),
    shortcuts: globalShortcut,
    capture: fakeScreen ? fakeCapture(fakeScreen) : electronCapture,
    actions,
    abortChats: () => chat.abortAll(),
    revokeToolSessions: () => toolBridge.rotateToken(),
    emit: (status) => {
      mainWindow?.webContents.send(IPC.computerStatusEvent, status)
      // Người dùng thường đang ở app khác (Blender, Unity…) khi bấm phím dừng → báo bằng thông báo Windows.
      if (status.lastStop && status.lastStop.at !== lastStopAt) {
        lastStopAt = status.lastStop.at
        if (Notification.isSupported()) {
          new Notification({ title: APP_NAME, body: 'Đã dừng khẩn cấp: trợ lý ngừng xem màn hình, mọi phản hồi đang chạy đã dừng.' }).show()
        }
      }
    },
    log,
    sidecar: {
      installed: () => sidecarInstaller.state.state === 'installed',
      call: (method, params) => sidecarClient.call(method, params),
      stop: () => sidecarClient.stop()
    },
    toDip: (rect) => screen.screenToDipRect(null, rect),
    // Thư mục log giả chỉ cho bản chưa đóng gói (test e2e).
    logRoots: appLogRoot ? { localAppData: appLogRoot, temp: join(appLogRoot, 'Temp') } : undefined
  })
  computer.registerTools(tools)
  app.on('will-quit', () => globalShortcut.unregisterAll())

  const providers: Record<AiProviderId, AIProvider> = {
    'claude-cli': new ClaudeCliProvider(
      log,
      () => ({ electronPath: process.execPath, script: permissionScript, url: approvals.url, token: approvals.token }),
      () => ({ electronPath: process.execPath, script: appToolsScript, url: toolBridge.url, token: toolBridge.token })
    ),
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
    getAssistant: () => accountScope.getAssistant(),
    getMemoryContext: (query) => memory.contextFor(query),
    loadModeSkill: (mode) => loadModeSkill(skillsDir, mode),
    workspaceDir,
    emit: (payload) => mainWindow?.webContents.send(IPC.chatEvent, payload),
    log,
    onRunEnd: (conversationId) => approvals.cancelConversation(conversationId),
    appToolsFor: () => computer.toolsFor()
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
    account: accountScope,
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
    accounts: new SavedAccountStore(join(userData, 'secrets'), safeStorage),
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    getWindow,
    getProvider,
    loadSkill: (name) => loadSkill(skillsDir, name),
    workspaceDir,
    log
  })
  const getUpdateSettings = (): UpdateSettings =>
    settings.get('update', updateSettingsSchema, DEFAULT_UPDATE_SETTINGS)
  const updates = new UpdateController({
    updater: createElectronUpdater({
      isPackaged: app.isPackaged,
      // Chỉ bản chưa đóng gói (dev/e2e) mới đọc cấu hình cập nhật từ biến môi trường.
      devConfigPath: app.isPackaged ? undefined : process.env.MMC_UPDATE_CONFIG,
      log
    }),
    getSettings: getUpdateSettings,
    getSkipped: () => settings.get('updateSkipped', z.string().nullable(), null),
    setSkipped: (version) => settings.set('updateSkipped', version),
    emit: (state) => mainWindow?.webContents.send(IPC.updateState, state),
    beforeInstall: async () => {
      if (!(await chat.stopAll(5_000))) log.warn('Vẫn còn lượt chat chưa dừng hẳn khi cài bản cập nhật')
    },
    log
  })
  app.on('before-quit', () => updates.stop())
  registerAppIpc({
    handle,
    log,
    updates,
    settings,
    getUpdateSettings,
    getProvider,
    loadSkill: (name) => loadSkill(skillsDir, name),
    workspaceDir
  })
  handle(IPC.accountSet, idSchema.nullable(), (uid) => {
    // Phiên chat đang chạy thuộc tài khoản cũ → dừng trước khi đổi phạm vi dữ liệu.
    if ((uid ?? LOCAL_OWNER) !== accountScope.current) chat.abortAll()
    const result = accountScope.set(uid)
    if (result.claimed) log.info('Đã giao trí nhớ tạo trước khi đăng nhập cho tài khoản đầu tiên')
    memory.emitCount()
    return result
  })
  registerComputerIpc({
    handle,
    computer,
    logsDir: actionsDir,
    sidecar: sidecarInstaller,
    stopSidecar: () => sidecarClient.stop()
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
  // Bắt đầu kiểm tra khi giao diện đã tải (renderer cũng tự hỏi getState lúc mở nên không lỡ trạng thái).
  mainWindow.webContents.once('did-finish-load', () => updates.start())
  log.info(`Khởi động ${APP_NAME} ${app.getVersion()}`)
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
      dialog.showErrorBox(APP_NAME, `${(err as Error).message}\n\nLog: ${log.file}`)
      app.quit()
    }
  })
  app.on('window-all-closed', () => app.quit())
}
