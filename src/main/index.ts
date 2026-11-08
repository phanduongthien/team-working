import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  net,
  protocol,
  Notification,
  safeStorage,
  screen,
  session,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import { is } from '@electron-toolkit/utils'
import { z } from 'zod'
import { APP_NAME, LEGACY_USER_DATA_DIR, OAUTH_REDIRECT_URL } from '@shared/appConfig'
import {
  DEFAULT_GMAIL_SETTINGS,
  DEFAULT_TELEGRAM_SETTINGS,
  gmailSettingsSchema,
  telegramSettingsSchema,
  type GmailSettings,
  type TelegramSettings
} from '@shared/connectors'
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
  type AiProviderId,
  chatOrganizeSettingsSchema,
  DEFAULT_CHAT_ORGANIZE_SETTINGS
} from '@shared/schemas'
import type { AIProvider } from './ai/AIProvider'
import { AnthropicApiProvider } from './ai/AnthropicApiProvider'
import { ClaudeCliProvider } from './ai/ClaudeCliProvider'
import { loadModeSkill, loadSkill } from './ai/skills'
import { backupBeforeUpgrade } from './db/backup'
import { openDatabase } from './db/client'
import {
  AgentExchangeRepository,
  LOCAL_OWNER,
  ConversationGroupRepository,
  ConversationRepository,
  MemoryRepository,
  MessageRepository,
  SettingsRepository,
  SuggestionRepository
} from './db/repositories'
import { CodeApprovals } from './code/approvals'
import { ConversationOrganizer } from './chat/organizer'
import { completeText } from './ai/AIProvider'
import { agentHttpServer } from './agents/httpServer'
import {
  AgentHub,
  agentSettingsSchema,
  DEFAULT_AGENT_SETTINGS,
  storedClientSchema
} from './agents/hub'
import { agentPrompt, agentSystemPrompt } from './agents/prompt'
import { KillSwitch } from './computer/killSwitch'
import { registerAgentsIpc } from './ipc/agents'
import { McpApprovals } from './mcpClient/approvals'
import { McpServerStore } from './mcpClient/store'
import { ActionLog } from './computer/actionLog'
import { electronCapture, fakeCapture } from './computer/electronCapture'
import { ComputerUseService } from './computer/service'
import { pythonCommand, SidecarClient } from './sidecar/client'
import { SidecarInstaller } from './sidecar/installer'
import { extractZip, runProcess } from './sidecar/process'
import { registerComputerIpc } from './ipc/computer'
import { ToolBridge } from './tools/bridge'
import { AppToolRegistry, combineToolSets } from './tools/registry'
import { TimeRepository } from './db/timeRepository'
import { registerAppIpc } from './ipc/app'
import { createHandle, registerIpc } from './ipc/register'
import { StateSync } from './services/stateSync'
import { createElectronUpdater } from './services/updater'
import { UpdateController } from './update/controller'
import { registerTeamIpc } from './ipc/team'
import { emitApproval, registerWorkIpc } from './ipc/work'
import { OAuthLoopback } from './services/oauthLoopback'
import { RateLimiter } from './agents/rateLimiter'
import { DraftApprovals } from './connectors/approvals'
import { FolderAccessRequests } from './code/folderAccess'
import { FakeGmailBackend } from './connectors/gmail/fake'
import { gmailTokenFileName, GoogleGmailBackend } from './connectors/gmail/google'
import { GmailService } from './connectors/gmail/service'
import { FakeTelegramBackend } from './connectors/telegram/fake'
import { GramJsBackend } from './connectors/telegram/gramjs'
import { TelegramService } from './connectors/telegram/service'
import { registerConnectorsIpc } from './ipc/connectors'
import { AccountScope } from './memory/accountScope'
import { MemoryService } from './memory/memoryService'
import { AttachmentStore } from './services/attachments'
import { electronClipboard, fakeClipboard } from './services/electronClipboard'
import { electronImages } from './services/electronImages'
import { ChatService } from './services/chatService'
import { createLogger } from './services/logger'
import { SavedAccountStore } from './services/savedAccounts'
import { SecretStore } from './services/secrets'
import { FakeChatProvider } from './ai/FakeChatProvider'
import { ARTIFACT_SCHEME, handleArtifactRequest } from './artifacts/protocol'
import { ArtifactService } from './artifacts/service'
import { registerArtifactsIpc } from './ipc/artifacts'
import { BUILTIN_THEMES, parseArtifactBlocks, themeSchema, type Theme } from '@shared/artifacts'
import { registerVoiceIpc } from './ipc/voice'
import { VoiceInstaller } from './voice/installer'
import { VoiceService, voiceSkillPrompt } from './voice/service'
import { DEFAULT_VOICE_SETTINGS, STT_MODELS, voiceSettingsSchema } from '@shared/voice'
import { affinityStatsSchema } from './expressive/affinity'
import { GiphyClient, readEnvKey } from './expressive/giphy'
import { ExpressiveService } from './expressive/service'
import { StickerLibrary } from './expressive/stickers'
import { registerExpressiveIpc } from './ipc/expressive'
import { registerSkillsIpc } from './ipc/skills'
import { SkillStore } from './skills/store'
import { learnStyle } from './skills/style'
import { DEFAULT_SKILLS_SETTINGS, skillsSettingsSchema } from '@shared/skills'
import {
  DEFAULT_EXPRESSIVE_SETTINGS,
  expressiveSettingsSchema,
  mediaRefSchema,
  EMPTY_RECENT,
  recentStoreSchema,
  stripExpressTags
} from '@shared/expressive'

// Phải chạy trước mọi thứ dùng userData (single-instance lock, log, safeStorage, DB). Không module nào
// được đọc app.getPath('userData') lúc import, vì import chạy trước dòng này.
// Test e2e dùng thư mục dữ liệu riêng để không đụng dữ liệu thật của người dùng; còn lại giữ thư mục
// cũ sau khi đổi productName (mặc định Electron sẽ chuyển sang %APPDATA%/<productName>).
// Artifact chạy ở origin riêng (mmc-artifact://) — tách khỏi app, iframe sandbox không same-origin.
protocol.registerSchemesAsPrivileged([{ scheme: 'mmc-artifact', privileges: { standard: true, secure: true } }])

app.setPath(
  'userData',
  process.env.TEAM_WORKING_USER_DATA || join(app.getPath('appData'), LEGACY_USER_DATA_DIR)
)

// Micro giả (tiếng bíp) cho test e2e giọng nói — chỉ bản chưa đóng gói.
if (!app.isPackaged && process.env.MMC_FAKE_VOICE === '1') {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
}

/** Tài nguyên đóng gói (extraResources) khi đã build, thư mục nguồn khi dev. */
function resourcePath(packaged: string, dev: string): string {
  return app.isPackaged ? join(process.resourcesPath, packaged) : join(app.getAppPath(), dev)
}

const log = createLogger(join(app.getPath('userData'), 'logs'))
let mainWindow: BrowserWindow | null = null

process.on('uncaughtException', (err) =>
  log.error(`uncaughtException: ${err.stack ?? err.message}`)
)
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
      webSecurity: true,
      // Tự đọc câu trả lời (giọng nói) không cần bấm chuột trước.
      autoplayPolicy: 'no-user-gesture-required'
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
  await backupBeforeUpgrade({
    dbFile,
    backupDir: join(userData, 'backups'),
    version: app.getVersion(),
    log
  })
  const { db, close } = openDatabase(dbFile, resourcePath('migrations', 'src/main/db/migrations'))
  app.on('will-quit', close)

  // Dữ liệu cá nhân (chat, trí nhớ, hồ sơ, trợ lý) theo tài khoản đang đăng nhập (renderer báo qua account:set).
  let scope: AccountScope | null = null
  const getOwner = (): string => scope?.current ?? LOCAL_OWNER
  const conversations = new ConversationRepository(db, getOwner)
  const conversationGroups = new ConversationGroupRepository(db, getOwner)
  const messages = new MessageRepository(db)
  const memories = new MemoryRepository(db, getOwner)
  const suggestions = new SuggestionRepository(db, getOwner)
  const settings = new SettingsRepository(db)
  // Đồng bộ trạng thái toàn app: mọi thay đổi (IPC có `changes`, ghi settings, việc nền) → sync:changed.
  const sync = new StateSync((topics) => mainWindow?.webContents.send(IPC.syncChanged, topics))
  settings.onChange = (key) => sync.settingsChanged(key)
  scope = new AccountScope({ memories, conversations, settings })
  const accountScope = scope
  const interrupted = messages.markInterrupted()
  if (interrupted) log.info(`Đánh dấu ${interrupted} tin nhắn bị gián đoạn`)

  const secrets = new SecretStore(join(userData, 'secrets'), safeStorage)

  // MCP server người dùng thêm (Mizuki dùng như tool) — mỗi lần gọi tool phải được duyệt.
  const mcpStore = new McpServerStore(
    {
      get: () => settings.get('mcpServers', z.array(z.any()), []),
      set: (list) => settings.set('mcpServers', list)
    },
    join(userData, 'secrets'),
    safeStorage
  )
  const mcpApprovals = new McpApprovals({
    store: mcpStore,
    emit: (req) => mainWindow?.webContents.send(IPC.mcpApprovalEvent, req),
    log
  })

  // Chế độ Code: mỗi lần Claude muốn sửa file, app hiện diff để người dùng duyệt.
  const approvals = new CodeApprovals({
    writableRoot: (id) => {
      const conv = conversations.get(id)
      return conv && conv.codeWrite && conv.cwd ? conv.cwd : null
    },
    emit: (request) => emitApproval(mainWindow, request),
    mcpApproval: (conversationId, toolName, input) =>
      mcpApprovals.request(conversationId, toolName, input),
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

  // Trợ lý tự xin quyền thư mục (mọi chế độ): người dùng tự chọn thư mục trong hộp thoại mới có quyền.
  const folderAccess = new FolderAccessRequests({
    getConversation: (id) => conversations.get(id),
    pickFolder: async (suggested) => {
      // Hộp chọn thư mục giả chỉ cho e2e ở bản chưa đóng gói — không bao giờ có trong bản phát hành.
      const fake = app.isPackaged ? undefined : process.env.MMC_FAKE_FOLDER
      if (fake !== undefined) return fake || null
      const options: Electron.OpenDialogOptions = {
        properties: ['openDirectory'],
        ...(suggested && existsSync(suggested) ? { defaultPath: suggested } : {})
      }
      const picked = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
      return picked.canceled ? null : (picked.filePaths[0] ?? null)
    },
    grant: (id, path, write) => {
      approvals.cancelConversation(id)
      const conv = conversations.setCwd(id, path)
      return conv && write ? conversations.setCodeWrite(id, true) : conv
    },
    emit: (event) => {
      mainWindow?.webContents.send(IPC.folderAccessEvent, event)
      if (!('closed' in event) && mainWindow && !mainWindow.isFocused()) mainWindow.flashFrame(true)
    },
    log
  })
  folderAccess.registerTools(tools)
  app.on('before-quit', () => folderAccess.cancelAll())

  const actionsDir = join(userData, 'logs', 'computer-use')
  const actions = new ActionLog(actionsDir)
  void actions
    .prune()
    .catch((err: Error) => log.warn(`Không dọn được log điều khiển máy tính: ${err.message}`))
  // Màn hình giả chỉ cho bản chưa đóng gói (test e2e) — không bao giờ có trong bản phát hành.
  const fakeScreen = app.isPackaged ? undefined : process.env.MMC_FAKE_SCREEN

  // Python sidecar (đọc cửa sổ / cây UI): chỉ tải khi người dùng bấm cài, nằm trong thư mục dữ liệu app.
  const devOverride = (name: string): string | undefined =>
    app.isPackaged ? undefined : process.env[name] || undefined
  const sidecarInstaller = new SidecarInstaller({
    root: join(userData, 'sidecar'),
    requirementsFile: resourcePath(
      'sidecar/requirements.txt',
      'resources/sidecar/requirements.txt'
    ),
    uvUrl: devOverride('MMC_SIDECAR_UV_URL'),
    fetch: (url, init) => net.fetch(url, init),
    run: runProcess,
    extractZip,
    emit: (state) => mainWindow?.webContents.send(IPC.sidecarStateEvent, state),
    log
  })
  void sidecarInstaller.refresh()
  const sidecarScript = resourcePath(
    'sidecar/desktop_server.py',
    'resources/sidecar/desktop_server.py'
  )
  const sidecarClient = new SidecarClient({
    command: () =>
      sidecarInstaller.state.state === 'installed'
        ? pythonCommand(sidecarInstaller.paths.venvPython, sidecarScript)
        : null,
    log
  })
  app.on('before-quit', () => {
    sidecarClient.stop()
    sidecarInstaller.cancel()
  })
  const appLogRoot = devOverride('MMC_APP_LOG_ROOT')
  let lastStopAt = 0
  const killSwitch = new KillSwitch(globalShortcut)
  const computer = new ComputerUseService({
    killSwitch,
    getSettings: () =>
      settings.get('computerUse', computerUseSettingsSchema, DEFAULT_COMPUTER_USE_SETTINGS),
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
          new Notification({
            title: APP_NAME,
            body: 'Đã dừng khẩn cấp: trợ lý ngừng xem màn hình, mọi phản hồi đang chạy đã dừng.'
          }).show()
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

  // Gmail / Telegram (GĐ 4): chỉ đọc + soạn nháp, mặc định tắt. Mỗi người tự tạo OAuth client / api_id;
  // secret, token, session chỉ nằm trên máy (DPAPI). Bản giả chỉ cho e2e ở bản chưa đóng gói.
  const secretsDir = join(userData, 'secrets')
  const draftApprovals = new DraftApprovals({
    emit: (req) => mainWindow?.webContents.send(IPC.draftApprovalEvent, req),
    log
  })
  const connectorLimiter = new RateLimiter(() => 60)
  const gmailOAuth = new OAuthLoopback()
  app.on('before-quit', () => {
    gmailOAuth.cancel()
    draftApprovals.cancelAll()
  })
  const gmailClientSecret = new SecretStore(secretsDir, safeStorage, 'gmail-client-secret.bin')
  const getGmailSettings = (): GmailSettings => settings.get('gmail', gmailSettingsSchema, DEFAULT_GMAIL_SETTINGS)
  const gmail = new GmailService({
    getSettings: getGmailSettings,
    setSettings: (value) => settings.set('gmail', value),
    backend:
      !app.isPackaged && process.env.MMC_FAKE_GMAIL === '1'
        ? new FakeGmailBackend()
        : new GoogleGmailBackend({
            fetch: (url, init) => net.fetch(url, init),
            openExternal: (url) => shell.openExternal(url),
            waitForCode: (open) => gmailOAuth.waitForCode(open),
            cancelWait: () => gmailOAuth.cancel(),
            redirectUri: OAUTH_REDIRECT_URL,
            clientId: () => getGmailSettings().clientId,
            clientSecret: () => gmailClientSecret.get(),
            // Mỗi tài khoản một file token. Tài khoản chuyển từ bản một-tài-khoản giữ file cũ → không phải đăng nhập lại.
            tokens: (accountId) => new SecretStore(secretsDir, safeStorage, gmailTokenFileName(accountId))
          }),
    clientSecret: gmailClientSecret,
    approvals: draftApprovals,
    limiter: connectorLimiter,
    emit: (status) => mainWindow?.webContents.send(IPC.gmailStatusEvent, status),
    log
  })
  gmail.registerTools(tools)
  const telegramApiHash = new SecretStore(secretsDir, safeStorage, 'telegram-api-hash.bin')
  const getTelegramSettings = (): TelegramSettings =>
    settings.get('telegram', telegramSettingsSchema, DEFAULT_TELEGRAM_SETTINGS)
  const telegramBackend =
    !app.isPackaged && process.env.MMC_FAKE_TELEGRAM === '1'
      ? new FakeTelegramBackend()
      : new GramJsBackend({
          apiId: () => getTelegramSettings().apiId,
          apiHash: () => telegramApiHash.get(),
          session: new SecretStore(secretsDir, safeStorage, 'telegram-session.bin'),
          appVersion: app.getVersion(),
          log
        })
  const telegram = new TelegramService({
    getSettings: getTelegramSettings,
    setSettings: (value) => settings.set('telegram', value),
    backend: telegramBackend,
    apiHash: telegramApiHash,
    approvals: draftApprovals,
    limiter: connectorLimiter,
    emit: (status) => mainWindow?.webContents.send(IPC.telegramStatusEvent, status),
    log
  })
  telegram.registerTools(tools)
  app.on('before-quit', () => void telegramBackend.cancelLogin())

  // Chat biểu cảm: GIF/sticker GIPHY (key: .env khi dev, hoặc người dùng dán — mã hoá DPAPI), sticker local, độ thân thiết trên máy.
  const giphyUserKey = new SecretStore(join(userData, 'secrets'), safeStorage, 'giphy-api-key.bin')
  // .env chỉ đọc ở bản chưa đóng gói (không có tiền tố VITE_ → không bao giờ nằm trong bộ cài).
  const giphyEnvKey = app.isPackaged
    ? null
    : 'GIPHY_API_KEY' in process.env // biến môi trường (kể cả rỗng, dùng trong test) được ưu tiên hơn file .env
      ? process.env.GIPHY_API_KEY || null
      : readEnvKey(join(app.getAppPath(), '.env'))
  const giphyKeySource = (): 'env' | 'user' | null =>
    giphyUserKey.has() ? 'user' : giphyEnvKey ? 'env' : null
  const giphy = new GiphyClient({
    getKey: () => giphyUserKey.get() ?? giphyEnvKey,
    fetch: (url) => net.fetch(url),
    baseUrl: devOverride('MMC_GIPHY_BASE')
  })
  const stickers = new StickerLibrary(
    resourcePath('stickers', 'resources/stickers'),
    join(userData, 'stickers')
  )
  stickers.ensureUserDir()
  const expressive = new ExpressiveService({
    getSettings: () =>
      settings.get('expressive', expressiveSettingsSchema, DEFAULT_EXPRESSIVE_SETTINGS),
    setSettings: (value) => settings.set('expressive', value),
    getStats: () => settings.get('expressiveStats', affinityStatsSchema.nullable(), null),
    setStats: (value) => settings.set('expressiveStats', value),
    getFavorites: () => settings.get('expressiveFavorites', z.array(mediaRefSchema), []),
    setFavorites: (list) => settings.set('expressiveFavorites', list),
    getRecent: () => settings.get('expressiveRecent', recentStoreSchema, EMPTY_RECENT),
    setRecent: (value) => settings.set('expressiveRecent', value),
    giphy,
    giphyKeySource,
    stickers,
    loadSkill: () => loadSkill(resourcePath('assistant-skills', 'assistant-skills'), 'expressive'),
    log
  })
  // Giọng nói: tiến trình Python riêng (voice_server.py) trong venv của sidecar; gói + model chỉ tải khi người dùng bấm.
  const fakeVoice = !app.isPackaged && process.env.MMC_FAKE_VOICE === '1'
  const voiceInstallerReal = new VoiceInstaller({
    modelsDir: join(userData, 'voice-models'),
    sidecar: () => ({ installed: sidecarInstaller.state.state === 'installed', paths: sidecarInstaller.paths }),
    requirements: {
      packages: resourcePath('sidecar/requirements-voice.txt', 'resources/sidecar/requirements-voice.txt'),
      cuda: resourcePath('sidecar/requirements-cuda.txt', 'resources/sidecar/requirements-cuda.txt')
    },
    fetch: (url, init) => net.fetch(url, init),
    run: runProcess,
    emit: (state) => mainWindow?.webContents.send(IPC.voicePackEvent, state),
    log
  })
  // Test e2e (bản chưa đóng gói + MMC_FAKE_VOICE): coi như đã cài, chép lời / đọc giả lập — không cần Python.
  const voiceInstaller = fakeVoice
    ? Object.assign(Object.create(voiceInstallerReal) as VoiceInstaller, {
        installed: async () => Object.fromEntries(['packages', 'piper', ...STT_MODELS].map((k) => [k, true]).concat([['cuda', false]]))
      })
    : voiceInstallerReal
  const voiceScript = resourcePath('sidecar/voice_server.py', 'resources/sidecar/voice_server.py')
  const voiceClient = new SidecarClient({
    command: () => (sidecarInstaller.state.state === 'installed' ? pythonCommand(sidecarInstaller.paths.venvPython, voiceScript) : null),
    log,
    timeoutMs: 120_000
  })
  app.on('before-quit', () => voiceClient.stop())
  // 2 giây im lặng (8 kHz, 16-bit) cho đọc giả lập — đủ dài để test thấy trạng thái "đang đọc".
  const SILENT_WAV = (() => {
    const data = 16_000 * 2
    const b = Buffer.alloc(44 + data)
    b.write('RIFF', 0)
    b.writeUInt32LE(36 + data, 4)
    b.write('WAVEfmt ', 8)
    b.writeUInt32LE(16, 16)
    b.writeUInt16LE(1, 20)
    b.writeUInt16LE(1, 22)
    b.writeUInt32LE(8_000, 24)
    b.writeUInt32LE(16_000, 28)
    b.writeUInt16LE(2, 32)
    b.writeUInt16LE(16, 34)
    b.write('data', 36)
    b.writeUInt32LE(data, 40)
    return b.toString('base64')
  })()
  const voice = new VoiceService({
    getSettings: () => settings.get('voice', voiceSettingsSchema, DEFAULT_VOICE_SETTINGS),
    setSettings: (value) => settings.set('voice', value),
    installer: voiceInstaller,
    sidecarInstalled: () => fakeVoice || sidecarInstaller.state.state === 'installed',
    call: fakeVoice
      ? (async (method: string) =>
          method === 'stt' ? { text: 'xin chào Mizuki, giọng nói giả lập' } : { audio: SILENT_WAV, mime: 'audio/wav' }) as never
      : (method, params, timeoutMs) => voiceClient.call(method, params, timeoutMs),
    stop: () => voiceClient.stop(),
    recordingsDir: join(workspaceDir, 'voice'),
    detectGpu: async () => {
      const r = await runProcess('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], {
        env: {},
        signal: new AbortController().signal,
        timeoutMs: 5_000
      }).catch(() => null)
      const [name, mb] = r?.code === 0 ? r.stdout.trim().split('\n')[0].split(',').map((s) => s.trim()) : []
      return name ? { name, vramMb: Number(mb) || 0 } : null
    },
    assistantName: () => accountScope.getAssistant().name,
    log
  })
  const pruneRecordings = (): void =>
    void voice.prune().then((n) => n && log.info(`Giọng nói: xoá ${n} ghi âm cũ hơn 7 ngày`))
  pruneRecordings()
  setInterval(pruneRecordings, 6 * 60 * 60 * 1000).unref()
  // Micro: chỉ cửa sổ chính, chỉ âm thanh (không camera). Quyền khác giữ như mặc định của Electron.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (permission !== 'media') return callback(true)
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? []
    callback(wc === mainWindow?.webContents && types.length > 0 && types.every((t) => t === 'audio'))
  })
  killSwitch.onStop(() => mainWindow?.webContents.send(IPC.voiceStopEvent))

  // Artifact: lưu theo hội thoại; theme slide = có sẵn + file JSON người dùng thêm + theme của skill đang bật.
  const artifacts = new ArtifactService({
    db,
    ownsConversation: (id) => !!conversations.get(id),
    onChange: () => sync.changed('artifacts')
  })
  const themesDir = join(userData, 'artifact-themes')
  const artifactThemes = (): Theme[] => {
    const extra: Theme[] = []
    for (const f of existsSync(themesDir) ? readdirSync(themesDir) : []) {
      if (!f.endsWith('.json')) continue
      try {
        extra.push(themeSchema.parse(JSON.parse(readFileSync(join(themesDir, f), 'utf8'))))
      } catch (err) {
        log.warn(`Theme artifact ${f} không hợp lệ: ${(err as Error).message}`)
      }
    }
    // Theme từ skill người dùng đang bật (themes/*.json trong thư mục skill).
    extra.push(...skillStore.themesSync())
    return [...extra.filter((t) => !BUILTIN_THEMES.some((b) => b.id === t.id)), ...BUILTIN_THEMES]
  }
  const artifactLibDir = resourcePath('artifact-runtime', 'out/artifact-runtime')
  protocol.handle(ARTIFACT_SCHEME, (req) => handleArtifactRequest(req.url, { service: artifacts, libDir: artifactLibDir, themes: artifactThemes }))

  // Claude giả chỉ cho test e2e ở bản chưa đóng gói.
  const fakeChat =
    !app.isPackaged && process.env.MMC_FAKE_CHAT === '1' ? new FakeChatProvider((name, input, conversationId) => tools.call(name, input, { conversationId })) : null

  const providers: Record<AiProviderId, AIProvider> = {
    'claude-cli': new ClaudeCliProvider(
      log,
      () => ({
        electronPath: process.execPath,
        script: permissionScript,
        url: approvals.url,
        token: approvals.token
      }),
      () => ({
        electronPath: process.execPath,
        script: appToolsScript,
        url: toolBridge.url,
        token: toolBridge.token
      }),
      () => mcpStore.forCli()
    ),
    'anthropic-api': new AnthropicApiProvider(() => secrets.get())
  }
  const getProvider = (): AIProvider =>
    fakeChat ?? providers[settings.get('ai', aiSettingsSchema, DEFAULT_AI_SETTINGS).provider]

  const skillsDir = resourcePath('assistant-skills', 'assistant-skills')
  const skillStore = new SkillStore({
    builtinDir: skillsDir,
    userDir: join(app.getPath('userData'), 'skills'),
    getSettings: () => settings.get('skills', skillsSettingsSchema, DEFAULT_SKILLS_SETTINGS),
    setSettings: (value) => settings.set('skills', value),
    log
  })
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
  // Tiêu đề ngắn + gợi ý nhóm cho cuộc trò chuyện mới (từ khoá ngay; model rẻ sau lượt trả lời đầu).
  const organizer = new ConversationOrganizer({
    conversations,
    groups: conversationGroups,
    messages,
    getProvider,
    getSettings: () => settings.get('chatOrganize', chatOrganizeSettingsSchema, DEFAULT_CHAT_ORGANIZE_SETTINGS),
    workspaceDir,
    log,
    changed: () => sync.changed('conversations')
  })
  const legacyTitles = organizer.fixLegacyTitles()
  if (legacyTitles) log.info(`Sửa ${legacyTitles} tiêu đề chat dạng lệnh tạo artifact`)
  const chat = new ChatService({
    conversations,
    messages,
    getProvider,
    getAssistant: () => accountScope.getAssistant(),
    getMemoryContext: (query) => memory.contextFor(query),
    loadModeSkill: (mode) => loadModeSkill(skillsDir, mode),
    userSkillsFor: (text) => skillStore.promptFor(text),
    workspaceDir,
    emit: (payload) => mainWindow?.webContents.send(IPC.chatEvent, payload),
    log,
    onFirstMessage: (conversationId, text) => organizer.onFirstMessage(conversationId, text),
    onRunEnd: (conversationId) => {
      // Thứ tự (cập nhật lúc trả lời xong) trên thanh bên.
      sync.changed('conversations')
      void organizer.afterRun(conversationId).catch((e: unknown) => log.warn(`Đặt tiêu đề tự động lỗi: ${String(e)}`))
      approvals.cancelConversation(conversationId)
      mcpApprovals.cancelConversation(conversationId)
      draftApprovals.cancelConversation(conversationId)
      folderAccess.cancelConversation(conversationId)
    },
    appToolsFor: (conversationId) =>
      combineToolSets([folderAccess.toolsFor(conversationId), computer.toolsFor(), gmail.toolsFor(), telegram.toolsFor()]),
    expressive,
    voicePrompt: async (tease) => {
      const skill = await loadSkill(skillsDir, 'voice')
      return skill ? voiceSkillPrompt(skill, tease) : ''
    },
    artifacts: {
      prompt: async () => {
        const skill = await loadSkill(skillsDir, 'artifacts')
        return skill ? `## Artifact\n${skill}\nTheme slide có sẵn: ${artifactThemes().map((t) => t.id).join(', ')}.` : ''
      },
      contextFor: (id) => artifacts.contextFor(id),
      applyReply: (id, raw) => artifacts.applyReply(id, raw)
    }
  })
  app.on('before-quit', () => chat.abortAll())

  const handle = createHandle(
    (event: IpcMainInvokeEvent) => event.sender === mainWindow?.webContents,
    log,
    sync
  )
  const getWindow = (): BrowserWindow | null => mainWindow
  registerIpc({
    conversations,
    groups: conversationGroups,
    messages,
    memories,
    suggestions,
    settings,
    account: accountScope,
    chat,
    resolveMedia: (ref) => expressive.resolve(ref),
    fakeCli: !!fakeChat,
    hasRecording: (id) => voice.hasRecording(id),
    memory,
    attachments: new AttachmentStore(join(workspaceDir, 'attachments'), electronImages),
    // Clipboard giả chỉ cho test e2e ở bản chưa đóng gói — không bao giờ có trong bản phát hành.
    clipboard:
      !app.isPackaged && process.env.MMC_FAKE_CLIPBOARD_DIR
        ? fakeClipboard(process.env.MMC_FAKE_CLIPBOARD_DIR)
        : electronClipboard,
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
      if (!(await chat.stopAll(5_000)))
        log.warn('Vẫn còn lượt chat chưa dừng hẳn khi cài bản cập nhật')
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
  const agentExchanges = new AgentExchangeRepository(db)
  agentExchanges.onChange = () => sync.changed('agentExchanges')
  const stale = agentExchanges.markInterrupted()
  if (stale) log.info(`Kết nối agent: đánh dấu ${stale} việc bị gián đoạn`)
  const agentHub = new AgentHub({
    getSettings: () => settings.get('agents', agentSettingsSchema, DEFAULT_AGENT_SETTINGS),
    setSettings: (value) => settings.set('agents', value),
    getClients: () => settings.get('agentClients', z.array(storedClientSchema), []),
    setClients: (list) => settings.set('agentClients', list),
    exchanges: agentExchanges,
    killSwitch,
    serverFactory: (hub) => agentHttpServer(hub, () => accountScope.getAssistant().name, log),
    // Trả lời agent khác: KHÔNG tool, KHÔNG trí nhớ/hồ sơ người dùng, không lưu session CLI.
    answer: async ({ agentName, request, kind, title }, signal) => {
      // Chỉ bản chưa đóng gói + MMC_FAKE_AGENT_ANSWER (test e2e): không gọi Claude thật.
      if (!app.isPackaged && process.env.MMC_FAKE_AGENT_ANSWER)
        return `Mizuki (giả lập) đã nhận: ${request.slice(0, 200)}`
      const result = await completeText(
        getProvider(),
        {
          prompt: agentPrompt(agentName, request, kind, title),
          systemPrompt: agentSystemPrompt(accountScope.getAssistant().name),
          mode: 'free',
          cwd: workspaceDir,
          ephemeral: true
        },
        signal
      )
      if ('error' in result) throw new Error(result.error)
      // Agent khác chỉ nhận chữ thường: không bao giờ có thẻ biểu cảm.
      return stripExpressTags(parseArtifactBlocks(result.text).text)
    },
    emitStatus: (status) => mainWindow?.webContents.send(IPC.agentsStatusEvent, status),
    emitNotice: (notice) => {
      mainWindow?.webContents.send(IPC.agentsNoticeEvent, notice)
      if (notice.kind === 'stopped' && Notification.isSupported()) {
        new Notification({ title: APP_NAME, body: 'Đã ngắt mọi kết nối agent.' }).show()
      }
    },
    log
  })
  app.on('before-quit', () => {
    mcpApprovals.cancelAll()
    void agentHub.shutdown()
  })
  registerAgentsIpc({
    handle,
    hub: agentHub,
    mcp: mcpStore,
    mcpApprovals,
    bridge: {
      exe: process.execPath,
      script: resourcePath('mizuki-mcp-bridge.cjs', 'resources/mizuki-mcp-bridge.cjs')
    }
  })
  registerSkillsIpc({
    handle,
    store: skillStore,
    userDir: join(app.getPath('userData'), 'skills'),
    getWindow,
    learnStyle: () =>
      learnStyle({
        conversations,
        messages,
        getProvider,
        loadSkill: (name) => loadSkill(skillsDir, name),
        existingNotes: () => skillStore.styleNotes(),
        workspaceDir,
        log
      }),
    // Chọn gói skill không qua hộp thoại — chỉ cho e2e ở bản chưa đóng gói.
    // MMC_FAKE_SKILL_PICK = file chứa đường dẫn gói (test ghi lại trước mỗi lần chọn).
    fakePick:
      !app.isPackaged && process.env.MMC_FAKE_SKILL_PICK
        ? () => readFileSync(process.env.MMC_FAKE_SKILL_PICK!, 'utf8').trim()
        : undefined
  })
  registerExpressiveIpc({ handle, expressive, giphyKey: giphyUserKey })
  registerArtifactsIpc({ handle, service: artifacts, themes: artifactThemes, getWindow, log, templatesDir: join(skillsDir, 'artifacts', 'templates') })
  registerVoiceIpc({
    handle,
    voice,
    installer: voiceInstaller,
    // Đang đọc → Ctrl+Alt+Q dừng đọc (dùng chung phím dừng khẩn cấp; app khác giữ phím thì vẫn có Esc).
    setSpeaking: (on) => (on ? killSwitch.arm('voice') : killSwitch.disarm('voice'))
  })
  registerComputerIpc({
    handle,
    computer,
    logsDir: actionsDir,
    sidecar: sidecarInstaller,
    stopSidecar: () => {
      sidecarClient.stop()
      voiceClient.stop()
    }
  })
  registerConnectorsIpc({ handle, gmail, telegram, approvals: draftApprovals })
  registerWorkIpc({
    handle,
    conversations,
    settings,
    time: new TimeRepository(db),
    approvals,
    folderAccess,
    memory,
    getProvider,
    loadSkill: (name) => loadSkill(skillsDir, name),
    workspaceDir,
    getWindow,
    log
  })

  mainWindow = createWindow()
  // Bắt đầu kiểm tra khi giao diện đã tải (renderer cũng tự hỏi getState lúc mở nên không lỡ trạng thái).
  mainWindow.webContents.once('did-finish-load', () => {
    updates.start()
    void agentHub.restore()
  })
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
