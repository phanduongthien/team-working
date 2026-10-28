import { writeFile } from 'node:fs/promises'
import { dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_APPEARANCE,
  DEFAULT_ASSISTANT,
  aiSettingsSchema,
  apiKeySchema,
  appearanceSchema,
  assistantProfileSchema,
  chatAbortSchema,
  chatSendSchema,
  conversationCreateSchema,
  conversationListSchema,
  conversationUpdateSchema,
  externalUrlSchema,
  idSchema,
  memoryCreateSchema,
  memoryUpdateSchema,
  suggestionResolveSchema,
  userProfileSchema
} from '@shared/schemas'
import { checkClaudeCli } from '../ai/claudeCli'
import type {
  ConversationRepository,
  MemoryRepository,
  MessageRepository,
  SettingsRepository,
  SuggestionRepository
} from '../db/repositories'
import type { MemoryService } from '../memory/memoryService'
import { ATTACHMENT_EXTENSIONS, type AttachmentStore } from '../services/attachments'
import type { ChatService } from '../services/chatService'
import type { Logger } from '../services/logger'
import type { SecretStore } from '../services/secrets'

export type IpcDeps = {
  conversations: ConversationRepository
  messages: MessageRepository
  memories: MemoryRepository
  suggestions: SuggestionRepository
  settings: SettingsRepository
  chat: ChatService
  memory: MemoryService
  attachments: AttachmentStore
  secrets: SecretStore
  log: Logger
  getWindow(): BrowserWindow | null
  handle: HandleFn
}

export type HandleFn = <S extends z.ZodType, R>(
  channel: string,
  schema: S,
  fn: (input: z.infer<S>) => R | Promise<R>
) => void

/** Tạo hàm đăng ký handler: kiểm tra sender, validate input bằng zod rồi mới gọi logic. */
export function createHandle(
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  log: { warn(msg: string): void }
): HandleFn {
  return (channel, schema, fn) => {
    ipcMain.handle(channel, async (event, raw: unknown) => {
      if (!isTrustedSender(event)) throw new Error('untrusted_sender')
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        log.warn(`IPC ${channel} input không hợp lệ: ${parsed.error.message}`)
        throw new Error('invalid_input')
      }
      return fn(parsed.data)
    })
  }
}

function handle<S extends z.ZodType, R>(
  deps: IpcDeps,
  channel: string,
  schema: S,
  fn: (input: z.infer<S>) => R | Promise<R>
): void {
  deps.handle(channel, schema, fn)
}

export function registerIpc(deps: IpcDeps): void {
  const none = z.undefined()
  const getAi = () => deps.settings.get('ai', aiSettingsSchema, DEFAULT_AI_SETTINGS)

  handle(deps, IPC.cliCheck, none, () => checkClaudeCli())

  // ---- Hội thoại & chat ----
  handle(deps, IPC.conversationsList, conversationListSchema, ({ query }) => deps.conversations.list(query))
  handle(deps, IPC.conversationsCreate, conversationCreateSchema, ({ mode }) => deps.conversations.create(mode))
  handle(deps, IPC.conversationsUpdate, conversationUpdateSchema, (input) => {
    const updated = deps.conversations.update(input)
    if (!updated) throw new Error('conversation_not_found')
    return updated
  })
  handle(deps, IPC.conversationsRemove, idSchema, (id) => deps.conversations.remove(id))
  handle(deps, IPC.messagesList, idSchema, (conversationId) => deps.messages.list(conversationId))

  handle(deps, IPC.chatSend, chatSendSchema, ({ conversationId, text, attachmentIds }) =>
    deps.chat.send(conversationId, text, deps.attachments.take(attachmentIds))
  )
  handle(deps, IPC.chatAbort, chatAbortSchema, ({ requestId }) => deps.chat.abort(requestId))
  handle(deps, IPC.chatPickAttachments, none, async () => {
    const win = deps.getWindow()
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Files', extensions: ATTACHMENT_EXTENSIONS }]
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled) return { attachments: [], rejected: [] }
    return deps.attachments.add(picked.filePaths)
  })

  // ---- Trí nhớ ----
  handle(deps, IPC.memoryGetProfile, none, () => deps.memory.getProfile())
  handle(deps, IPC.memorySetProfile, userProfileSchema, (p) => deps.memory.setProfile(p))
  handle(deps, IPC.memoryList, z.string().trim().max(200).optional(), (query) => deps.memories.list(query))
  handle(deps, IPC.memoryCreate, memoryCreateSchema, ({ content, category }) =>
    deps.memories.create(content, category)
  )
  handle(deps, IPC.memoryUpdate, memoryUpdateSchema, ({ id, content, category }) => {
    const updated = deps.memories.update(id, content, category)
    if (!updated) throw new Error('memory_not_found')
    return updated
  })
  handle(deps, IPC.memoryRemove, idSchema, (id) => deps.memories.remove(id))
  handle(deps, IPC.memorySuggestions, none, () => deps.suggestions.pending())
  handle(deps, IPC.memoryResolve, suggestionResolveSchema, (input) => deps.memory.resolve(input))
  handle(deps, IPC.memoryExtract, idSchema, (conversationId) => deps.memory.extract(conversationId))
  handle(deps, IPC.memoryConversationLeft, idSchema, (conversationId) => {
    // Chạy nền, không chặn UI; bỏ qua nếu hội thoại vẫn đang chờ phản hồi.
    if (!deps.chat.isBusy(conversationId)) void deps.memory.maybeAutoExtract(conversationId)
  })
  handle(deps, IPC.memoryExport, none, async () => {
    const win = deps.getWindow()
    const options: Electron.SaveDialogOptions = {
      defaultPath: `team-working-memory-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const target = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (target.canceled || !target.filePath) return null
    await writeFile(target.filePath, JSON.stringify(deps.memory.exportData(), null, 2), 'utf8')
    return target.filePath
  })

  // ---- Cài đặt ----
  handle(deps, IPC.settingsGetAssistant, none, () =>
    deps.settings.get('assistant', assistantProfileSchema, DEFAULT_ASSISTANT)
  )
  handle(deps, IPC.settingsSetAssistant, assistantProfileSchema, (p) => deps.settings.set('assistant', p))
  handle(deps, IPC.settingsGetAppearance, none, () =>
    deps.settings.get('appearance', appearanceSchema, DEFAULT_APPEARANCE)
  )
  handle(deps, IPC.settingsSetAppearance, appearanceSchema, (a) => deps.settings.set('appearance', a))
  // Không bao giờ trả API key về renderer — chỉ báo có/không.
  handle(deps, IPC.settingsGetAi, none, () => ({
    ...getAi(),
    hasApiKey: deps.secrets.has(),
    secureStorage: deps.secrets.available
  }))
  handle(deps, IPC.settingsSetAi, aiSettingsSchema, (s) => deps.settings.set('ai', s))
  handle(deps, IPC.settingsSetApiKey, apiKeySchema, (key) => deps.secrets.set(key))
  handle(deps, IPC.settingsClearApiKey, none, () => {
    deps.secrets.clear()
    if (getAi().provider === 'anthropic-api') deps.settings.set('ai', { ...getAi(), provider: 'claude-cli' })
  })

  handle(deps, IPC.appOpenExternal, externalUrlSchema, (url) => shell.openExternal(url))
}
