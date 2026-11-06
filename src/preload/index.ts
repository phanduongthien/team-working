import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { ComputerStatus } from '@shared/computer'
import type { SidecarState } from '@shared/sidecar'
import type { DraftApprovalRequest, GmailStatus, TelegramStatus } from '@shared/connectors'
import type { AgentNotice, AgentServerStatus, McpApprovalRequest } from '@shared/agents'
import type {
  ChatStreamPayload,
  CodeApprovalRequest,
  MemoryEventPayload,
  TeamWorkingApi
} from '@shared/types'
import type { UpdateState } from '@shared/update'

/** Đăng ký nghe sự kiện main → renderer; trả về hàm hủy. */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_e: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

/** Chỉ expose các hàm có tên rõ ràng — renderer không bao giờ chạm ipcRenderer trực tiếp. */
const api: TeamWorkingApi = {
  cli: {
    check: () => ipcRenderer.invoke(IPC.cliCheck)
  },
  conversations: {
    list: (query) => ipcRenderer.invoke(IPC.conversationsList, { query }),
    create: (mode) => ipcRenderer.invoke(IPC.conversationsCreate, { mode }),
    update: (input) => ipcRenderer.invoke(IPC.conversationsUpdate, input),
    remove: (id) => ipcRenderer.invoke(IPC.conversationsRemove, id)
  },
  messages: {
    list: (conversationId) => ipcRenderer.invoke(IPC.messagesList, conversationId)
  },
  skills: {
    list: () => ipcRenderer.invoke(IPC.skillsList),
    get: (source, name) => ipcRenderer.invoke(IPC.skillsGet, { source, name }),
    pick: (kind) => ipcRenderer.invoke(IPC.skillsPick, kind),
    install: (token) => ipcRenderer.invoke(IPC.skillsInstall, token),
    cancelPreview: (token) => ipcRenderer.invoke(IPC.skillsCancelPreview, token),
    remove: (name) => ipcRenderer.invoke(IPC.skillsRemove, name),
    setEnabled: (name, enabled) => ipcRenderer.invoke(IPC.skillsSetEnabled, { name, enabled }),
    openFolder: () => ipcRenderer.invoke(IPC.skillsOpenFolder),
    styleNotes: () => ipcRenderer.invoke(IPC.skillsStyleNotes),
    setStyleNotes: (notes) => ipcRenderer.invoke(IPC.skillsSetStyleNotes, notes),
    learnStyle: () => ipcRenderer.invoke(IPC.skillsLearnStyle)
  },
  voice: {
    status: () => ipcRenderer.invoke(IPC.voiceStatus),
    setSettings: (value) => ipcRenderer.invoke(IPC.voiceSetSettings, value),
    install: (component) => ipcRenderer.invoke(IPC.voiceInstall, component),
    cancel: () => ipcRenderer.invoke(IPC.voiceCancel),
    removeModel: (component) => ipcRenderer.invoke(IPC.voiceRemoveModel, component),
    transcribe: (wav, durationMs) => ipcRenderer.invoke(IPC.voiceTranscribe, { wav, durationMs }),
    speak: (text) => ipcRenderer.invoke(IPC.voiceSpeak, text),
    setSpeaking: (on) => ipcRenderer.invoke(IPC.voiceSpeaking, on),
    recording: (id) => ipcRenderer.invoke(IPC.voiceRecording, id),
    onPack: (listener) => subscribe(IPC.voicePackEvent, listener),
    onStop: (listener) => subscribe(IPC.voiceStopEvent, () => listener())
  },
  artifacts: {
    list: (conversationId) => ipcRenderer.invoke(IPC.artifactsList, conversationId),
    versions: (id) => ipcRenderer.invoke(IPC.artifactsVersions, id),
    content: (id, version) => ipcRenderer.invoke(IPC.artifactsContent, { id, version }),
    saveVersion: (id, content) => ipcRenderer.invoke(IPC.artifactsSave, { id, content }),
    restore: (id, version) => ipcRenderer.invoke(IPC.artifactsRestore, { id, version }),
    export: (id, version, format) => ipcRenderer.invoke(IPC.artifactsExport, { artifactId: id, version, format }),
    templates: () => ipcRenderer.invoke(IPC.artifactsTemplates)
  },
  expressive: {
    status: () => ipcRenderer.invoke(IPC.expressiveStatus),
    setSettings: (value) => ipcRenderer.invoke(IPC.expressiveSetSettings, value),
    resetAuto: () => ipcRenderer.invoke(IPC.expressiveResetAuto),
    setGiphyKey: (key) => ipcRenderer.invoke(IPC.expressiveSetGiphyKey, key),
    search: (kind, query, offset = 0) =>
      ipcRenderer.invoke(IPC.expressiveSearch, { kind, query, offset }),
    stickers: () => ipcRenderer.invoke(IPC.expressiveStickers),
    stickerData: (id) => ipcRenderer.invoke(IPC.expressiveStickerData, id),
    openStickersFolder: () => ipcRenderer.invoke(IPC.expressiveOpenStickers),
    favorites: () => ipcRenderer.invoke(IPC.expressiveFavorites),
    toggleFavorite: (ref) => ipcRenderer.invoke(IPC.expressiveToggleFavorite, ref)
  },
  chat: {
    send: (conversationId, text, attachmentIds = []) =>
      ipcRenderer.invoke(IPC.chatSend, { conversationId, text, attachmentIds }),
    abort: (requestId) => ipcRenderer.invoke(IPC.chatAbort, { requestId }),
    onEvent: (listener) => subscribe<ChatStreamPayload>(IPC.chatEvent, listener),
    pickAttachments: () => ipcRenderer.invoke(IPC.chatPickAttachments),
    addFile: (name, data) => ipcRenderer.invoke(IPC.chatAddFile, { name, data }),
    pasteClipboard: () => ipcRenderer.invoke(IPC.chatPasteClipboard),
    attachmentPreview: (id, size) => ipcRenderer.invoke(IPC.chatAttachmentPreview, { id, size }),
    sendMedia: (conversationId, text, media) =>
      ipcRenderer.invoke(IPC.chatSend, { conversationId, text, media }),
    sendVoice: (conversationId, text, voice) => ipcRenderer.invoke(IPC.chatSend, { conversationId, text, voice }),
    react: (messageId, emoji) => ipcRenderer.invoke(IPC.chatReact, { messageId, emoji })
  },
  memory: {
    getProfile: () => ipcRenderer.invoke(IPC.memoryGetProfile),
    setProfile: (profile) => ipcRenderer.invoke(IPC.memorySetProfile, profile),
    list: (query) => ipcRenderer.invoke(IPC.memoryList, query),
    create: (content, category) => ipcRenderer.invoke(IPC.memoryCreate, { content, category }),
    update: (id, content, category) =>
      ipcRenderer.invoke(IPC.memoryUpdate, { id, content, category }),
    remove: (id) => ipcRenderer.invoke(IPC.memoryRemove, id),
    suggestions: () => ipcRenderer.invoke(IPC.memorySuggestions),
    resolve: (input) => ipcRenderer.invoke(IPC.memoryResolve, input),
    extract: (conversationId) => ipcRenderer.invoke(IPC.memoryExtract, conversationId),
    conversationLeft: (conversationId) =>
      ipcRenderer.invoke(IPC.memoryConversationLeft, conversationId),
    export: () => ipcRenderer.invoke(IPC.memoryExport),
    onEvent: (listener) => subscribe<MemoryEventPayload>(IPC.memoryEvent, listener)
  },
  settings: {
    getAssistant: () => ipcRenderer.invoke(IPC.settingsGetAssistant),
    setAssistant: (profile) => ipcRenderer.invoke(IPC.settingsSetAssistant, profile),
    getAppearance: () => ipcRenderer.invoke(IPC.settingsGetAppearance),
    setAppearance: (appearance) => ipcRenderer.invoke(IPC.settingsSetAppearance, appearance),
    getAi: () => ipcRenderer.invoke(IPC.settingsGetAi),
    setAi: (settings) => ipcRenderer.invoke(IPC.settingsSetAi, settings),
    setApiKey: (key) => ipcRenderer.invoke(IPC.settingsSetApiKey, key),
    clearApiKey: () => ipcRenderer.invoke(IPC.settingsClearApiKey)
  },
  update: {
    getState: () => ipcRenderer.invoke(IPC.updateGetState),
    onState: (listener) => subscribe<UpdateState>(IPC.updateState, listener),
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    download: () => ipcRenderer.invoke(IPC.updateDownload),
    postpone: () => ipcRenderer.invoke(IPC.updatePostpone),
    skip: () => ipcRenderer.invoke(IPC.updateSkip),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    getSettings: () => ipcRenderer.invoke(IPC.settingsGetUpdate),
    setSettings: (settings) => ipcRenderer.invoke(IPC.settingsSetUpdate, settings)
  },
  app: {
    openExternal: (url) => ipcRenderer.invoke(IPC.appOpenExternal, url),
    onNavigate: (listener) => subscribe<string>(IPC.appNavigate, listener),
    logError: (message) => ipcRenderer.invoke(IPC.appLogError, message),
    bugInfo: () => ipcRenderer.invoke(IPC.appBugInfo)
  },
  computer: {
    status: () => ipcRenderer.invoke(IPC.computerStatus),
    onStatus: (listener) => subscribe<ComputerStatus>(IPC.computerStatusEvent, listener),
    setEnabled: (enabled, acceptWarning) =>
      ipcRenderer.invoke(IPC.computerSetEnabled, { enabled, acceptWarning }),
    setScreenAccess: (on) => ipcRenderer.invoke(IPC.computerSetScreenAccess, on),
    emergencyStop: () => ipcRenderer.invoke(IPC.computerEmergencyStop),
    preview: (display) => ipcRenderer.invoke(IPC.computerPreview, { display }),
    openLogs: () => ipcRenderer.invoke(IPC.computerOpenLogs)
  },
  agents: {
    status: () => ipcRenderer.invoke(IPC.agentsStatus),
    onStatus: (listener) => subscribe<AgentServerStatus>(IPC.agentsStatusEvent, listener),
    onNotice: (listener) => subscribe<AgentNotice>(IPC.agentsNoticeEvent, listener),
    setEnabled: (on) => ipcRenderer.invoke(IPC.agentsSetEnabled, on),
    setLimits: (limits) => ipcRenderer.invoke(IPC.agentsSetLimits, limits),
    createClient: (name) => ipcRenderer.invoke(IPC.agentsCreateClient, name),
    revoke: (id) => ipcRenderer.invoke(IPC.agentsRevoke, id),
    respondPairing: (clientId, allow) =>
      ipcRenderer.invoke(IPC.agentsRespondPairing, { clientId, allow }),
    stopAll: () => ipcRenderer.invoke(IPC.agentsStopAll),
    exchanges: () => ipcRenderer.invoke(IPC.agentsExchanges)
  },
  mcp: {
    list: () => ipcRenderer.invoke(IPC.mcpList),
    save: (input) => ipcRenderer.invoke(IPC.mcpSave, input),
    remove: (id) => ipcRenderer.invoke(IPC.mcpRemove, id),
    setEnabled: (id, enabled) => ipcRenderer.invoke(IPC.mcpSetEnabled, { id, enabled }),
    revokeAlways: (id, tool) => ipcRenderer.invoke(IPC.mcpRevokeAlways, { id, tool }),
    onApproval: (listener) => subscribe<McpApprovalRequest>(IPC.mcpApprovalEvent, listener),
    respond: (id, decision) => ipcRenderer.invoke(IPC.mcpRespond, { id, decision })
  },
  sidecar: {
    state: () => ipcRenderer.invoke(IPC.sidecarState),
    onState: (listener) => subscribe<SidecarState>(IPC.sidecarStateEvent, listener),
    install: () => ipcRenderer.invoke(IPC.sidecarInstall),
    cancel: () => ipcRenderer.invoke(IPC.sidecarCancel),
    uninstall: () => ipcRenderer.invoke(IPC.sidecarUninstall),
    check: () => ipcRenderer.invoke(IPC.sidecarCheck)
  },
  gmail: {
    status: () => ipcRenderer.invoke(IPC.gmailStatus),
    onStatus: (listener) => subscribe<GmailStatus>(IPC.gmailStatusEvent, listener),
    setEnabled: (enabled) => ipcRenderer.invoke(IPC.gmailSetEnabled, enabled),
    setCredentials: (input) => ipcRenderer.invoke(IPC.gmailSetCredentials, input),
    setOptions: (input) => ipcRenderer.invoke(IPC.gmailSetOptions, input),
    connect: () => ipcRenderer.invoke(IPC.gmailConnect),
    cancelConnect: () => ipcRenderer.invoke(IPC.gmailCancelConnect),
    disconnect: () => ipcRenderer.invoke(IPC.gmailDisconnect),
    preview: () => ipcRenderer.invoke(IPC.gmailPreview)
  },
  telegram: {
    status: () => ipcRenderer.invoke(IPC.telegramStatus),
    onStatus: (listener) => subscribe<TelegramStatus>(IPC.telegramStatusEvent, listener),
    setEnabled: (enabled) => ipcRenderer.invoke(IPC.telegramSetEnabled, enabled),
    setCredentials: (input) => ipcRenderer.invoke(IPC.telegramSetCredentials, input),
    sendCode: (phone) => ipcRenderer.invoke(IPC.telegramSendCode, phone),
    signIn: (code) => ipcRenderer.invoke(IPC.telegramSignIn, code),
    password: (password) => ipcRenderer.invoke(IPC.telegramPassword, password),
    cancelLogin: () => ipcRenderer.invoke(IPC.telegramCancelLogin),
    logout: () => ipcRenderer.invoke(IPC.telegramLogout),
    chats: (force) => ipcRenderer.invoke(IPC.telegramChats, force),
    setLists: (input) => ipcRenderer.invoke(IPC.telegramSetLists, input)
  },
  drafts: {
    onApproval: (listener) =>
      subscribe<DraftApprovalRequest | { id: string; closed: true }>(IPC.draftApprovalEvent, listener),
    respond: (decision) => ipcRenderer.invoke(IPC.draftRespond, decision)
  },
  ideas: {
    format: (input) => ipcRenderer.invoke(IPC.ideasFormat, input)
  },
  auth: {
    oauth: (authorizeUrl) => ipcRenderer.invoke(IPC.authOAuth, authorizeUrl),
    cancel: () => ipcRenderer.invoke(IPC.authCancel)
  },
  notify: {
    show: (notification) => ipcRenderer.invoke(IPC.notifyShow, notification)
  },
  planner: {
    planTasks: (request) => ipcRenderer.invoke(IPC.plannerPlanTasks, request)
  },
  feedback: {
    coach: (request) => ipcRenderer.invoke(IPC.feedbackCoach, request),
    summarize: (request) => ipcRenderer.invoke(IPC.feedbackSummarize, request)
  },
  code: {
    chooseFolder: (conversationId) => ipcRenderer.invoke(IPC.codeChooseFolder, conversationId),
    setWrite: (conversationId, enabled) =>
      ipcRenderer.invoke(IPC.codeSetWrite, { conversationId, enabled }),
    respond: (id, allow) => ipcRenderer.invoke(IPC.codeRespond, { id, allow }),
    onApproval: (listener) => subscribe<CodeApprovalRequest>(IPC.codeApproval, listener)
  },
  time: {
    current: () => ipcRenderer.invoke(IPC.timeCurrent),
    start: (input) => ipcRenderer.invoke(IPC.timeStart, input),
    stop: () => ipcRenderer.invoke(IPC.timeStop),
    list: (from, to) => ipcRenderer.invoke(IPC.timeList, { from, to }),
    addManual: (input) => ipcRenderer.invoke(IPC.timeAddManual, input),
    update: (input) => ipcRenderer.invoke(IPC.timeUpdate, input),
    remove: (id) => ipcRenderer.invoke(IPC.timeRemove, id),
    exportCsv: (input) => ipcRenderer.invoke(IPC.timeExportCsv, input),
    onChanged: (listener) => subscribe<void>(IPC.timeChanged, listener),
    getWorkday: () => ipcRenderer.invoke(IPC.settingsGetWorkday),
    setWorkday: (workday) => ipcRenderer.invoke(IPC.settingsSetWorkday, workday)
  },
  learning: {
    planPath: (request) => ipcRenderer.invoke(IPC.learningPath, request),
    makeQuiz: (request) => ipcRenderer.invoke(IPC.learningQuiz, request),
    grade: (request) => ipcRenderer.invoke(IPC.learningGrade, request),
    suggestMemory: (content, category) =>
      ipcRenderer.invoke(IPC.memorySuggest, { content, category })
  },
  dayPlanner: {
    plan: (request) => ipcRenderer.invoke(IPC.plannerDay, request),
    report: (request) => ipcRenderer.invoke(IPC.plannerReport, request)
  },
  account: {
    set: (uid) => ipcRenderer.invoke(IPC.accountSet, uid)
  },
  accounts: {
    list: () => ipcRenderer.invoke(IPC.accountsList),
    record: (account, session) => ipcRenderer.invoke(IPC.accountsRecord, { account, session }),
    remember: (id, remember, session) =>
      ipcRenderer.invoke(IPC.accountsRemember, { id, remember, session }),
    session: (id) => ipcRenderer.invoke(IPC.accountsSession, id),
    dropSession: (id) => ipcRenderer.invoke(IPC.accountsDropSession, id),
    forget: (id) => ipcRenderer.invoke(IPC.accountsForget, id)
  }
}

contextBridge.exposeInMainWorld('api', api)
