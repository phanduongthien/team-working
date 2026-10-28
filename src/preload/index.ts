import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { ChatStreamPayload, MemoryEventPayload, TeamWorkingApi } from '@shared/types'

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
    onNavigate: (listener) => subscribe<string>(IPC.appNavigate, listener)
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
  }
}

contextBridge.exposeInMainWorld('api', api)
