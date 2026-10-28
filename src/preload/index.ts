import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { ChatStreamPayload, TeamWorkingApi } from '@shared/types'

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
    send: (conversationId, text) => ipcRenderer.invoke(IPC.chatSend, { conversationId, text }),
    abort: (requestId) => ipcRenderer.invoke(IPC.chatAbort, { requestId }),
    onEvent: (listener) => {
      const wrapped = (_e: IpcRendererEvent, payload: ChatStreamPayload): void => listener(payload)
      ipcRenderer.on(IPC.chatEvent, wrapped)
      return () => ipcRenderer.removeListener(IPC.chatEvent, wrapped)
    }
  },
  settings: {
    getAssistant: () => ipcRenderer.invoke(IPC.settingsGetAssistant),
    setAssistant: (profile) => ipcRenderer.invoke(IPC.settingsSetAssistant, profile),
    getAppearance: () => ipcRenderer.invoke(IPC.settingsGetAppearance),
    setAppearance: (appearance) => ipcRenderer.invoke(IPC.settingsSetAppearance, appearance)
  },
  app: {
    openExternal: (url) => ipcRenderer.invoke(IPC.appOpenExternal, url)
  }
}

contextBridge.exposeInMainWorld('api', api)
