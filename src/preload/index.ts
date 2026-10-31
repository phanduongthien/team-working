import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { ChatStreamPayload, CodeApprovalRequest, MemoryEventPayload, TeamWorkingApi } from '@shared/types'

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
  chat: {
    send: (conversationId, text, attachmentIds = []) =>
      ipcRenderer.invoke(IPC.chatSend, { conversationId, text, attachmentIds }),
    abort: (requestId) => ipcRenderer.invoke(IPC.chatAbort, { requestId }),
    onEvent: (listener) => subscribe<ChatStreamPayload>(IPC.chatEvent, listener),
    pickAttachments: () => ipcRenderer.invoke(IPC.chatPickAttachments)
  },
  memory: {
    getProfile: () => ipcRenderer.invoke(IPC.memoryGetProfile),
    setProfile: (profile) => ipcRenderer.invoke(IPC.memorySetProfile, profile),
    list: (query) => ipcRenderer.invoke(IPC.memoryList, query),
    create: (content, category) => ipcRenderer.invoke(IPC.memoryCreate, { content, category }),
    update: (id, content, category) => ipcRenderer.invoke(IPC.memoryUpdate, { id, content, category }),
    remove: (id) => ipcRenderer.invoke(IPC.memoryRemove, id),
    suggestions: () => ipcRenderer.invoke(IPC.memorySuggestions),
    resolve: (input) => ipcRenderer.invoke(IPC.memoryResolve, input),
    extract: (conversationId) => ipcRenderer.invoke(IPC.memoryExtract, conversationId),
    conversationLeft: (conversationId) => ipcRenderer.invoke(IPC.memoryConversationLeft, conversationId),
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
  app: {
    openExternal: (url) => ipcRenderer.invoke(IPC.appOpenExternal, url),
    onNavigate: (listener) => subscribe<string>(IPC.appNavigate, listener),
    logError: (message) => ipcRenderer.invoke(IPC.appLogError, message),
    bugInfo: () => ipcRenderer.invoke(IPC.appBugInfo),
    onUpdateReady: (listener) => subscribe<{ version: string }>(IPC.updateReady, listener),
    installUpdate: () => ipcRenderer.invoke(IPC.updateInstall)
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
    setWrite: (conversationId, enabled) => ipcRenderer.invoke(IPC.codeSetWrite, { conversationId, enabled }),
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
    suggestMemory: (content, category) => ipcRenderer.invoke(IPC.memorySuggest, { content, category })
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
    remember: (id, remember, session) => ipcRenderer.invoke(IPC.accountsRemember, { id, remember, session }),
    session: (id) => ipcRenderer.invoke(IPC.accountsSession, id),
    dropSession: (id) => ipcRenderer.invoke(IPC.accountsDropSession, id),
    forget: (id) => ipcRenderer.invoke(IPC.accountsForget, id)
  }
}

contextBridge.exposeInMainWorld('api', api)
