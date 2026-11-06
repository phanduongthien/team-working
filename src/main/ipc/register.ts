import type { MediaRef, MessageMedia } from '@shared/expressive'
import { writeFile } from 'node:fs/promises'
import { dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_APPEARANCE,
  aiSettingsSchema,
  apiKeySchema,
  appearanceSchema,
  assistantProfileSchema,
  chatAbortSchema,
  chatSendSchema,
  chatReactSchema,
  chatAddFileSchema,
  chatAttachmentPreviewSchema,
  DEFAULT_CHAT_ORGANIZE_SETTINGS,
  chatOrganizeSettingsSchema,
  conversationAnswerSuggestionSchema,
  conversationCreateSchema,
  conversationGroupNameSchema,
  conversationGroupUpdateSchema,
  conversationListSchema,
  conversationUpdateSchema,
  externalUrlSchema,
  idSchema,
  memoryCreateSchema,
  memoryUpdateSchema,
  suggestionResolveSchema,
  suggestionResolveManySchema,
  userProfileSchema
} from '@shared/schemas'
import { checkClaudeCli } from '../ai/claudeCli'
import {
  GroupNameTakenError,
  type ConversationGroupRepository,
  type ConversationRepository,
  type MemoryRepository,
  type MessageRepository,
  type SettingsRepository,
  type SuggestionRepository
} from '../db/repositories'
import type { AccountScope } from '../memory/accountScope'
import type { MemoryService } from '../memory/memoryService'
import {
  ATTACHMENT_EXTENSIONS,
  type AttachmentStore,
  type ClipboardPort
} from '../services/attachments'
import type { ChatService } from '../services/chatService'
import type { Logger } from '../services/logger'
import type { SecretStore } from '../services/secrets'
import type { StateSync } from '../services/stateSync'
import type { SyncTopic } from '@shared/sync'

export type IpcDeps = {
  conversations: ConversationRepository
  groups: ConversationGroupRepository
  messages: MessageRepository
  memories: MemoryRepository
  suggestions: SuggestionRepository
  settings: SettingsRepository
  account: Pick<AccountScope, 'getAssistant' | 'setAssistant'>
  chat: ChatService
  /** GIF / sticker người dùng chọn (theo id) → thông tin đầy đủ do main tra lại. */
  resolveMedia(ref: MediaRef): Promise<MessageMedia | null>
  /** Ghi âm gốc của tin giọng nói có tồn tại không. */
  hasRecording?(id: string): boolean
  /** Test e2e (bản chưa đóng gói + MMC_FAKE_CHAT): coi như đã có Claude CLI. */
  fakeCli?: boolean
  memory: MemoryService
  attachments: AttachmentStore
  /** Clipboard của Windows (Ctrl+V ảnh / file copy từ Explorer). */
  clipboard: ClipboardPort
  secrets: SecretStore
  log: Logger
  getWindow(): BrowserWindow | null
  handle: HandleFn
}

export type HandleOptions = {
  /**
   * Thao tác làm đổi trạng thái của các mục này → sau khi xong (kể cả khi lỗi) tự phát `sync:changed`.
   * MỌI handler đổi trạng thái phải khai báo — renderer dựa vào đây để cập nhật mọi trang đang mở.
   */
  changes?: SyncTopic | SyncTopic[]
}

export type HandleFn = <S extends z.ZodType, R>(
  channel: string,
  schema: S,
  fn: (input: z.infer<S>) => R | Promise<R>,
  options?: HandleOptions
) => void

/** Tạo hàm đăng ký handler: kiểm tra sender, validate input bằng zod rồi mới gọi logic; báo đồng bộ nếu có `changes`. */
export function createHandle(
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  log: { warn(msg: string): void },
  sync?: Pick<StateSync, 'track'>
): HandleFn {
  return (channel, schema, fn, options) => {
    ipcMain.handle(channel, async (event, raw: unknown) => {
      if (!isTrustedSender(event)) throw new Error('untrusted_sender')
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        log.warn(`IPC ${channel} input không hợp lệ: ${parsed.error.message}`)
        throw new Error('invalid_input')
      }
      const changes = options?.changes
      return changes && sync ? sync.track(changes, () => fn(parsed.data)) : fn(parsed.data)
    })
  }
}

function handle<S extends z.ZodType, R>(
  deps: IpcDeps,
  channel: string,
  schema: S,
  fn: (input: z.infer<S>) => R | Promise<R>,
  options?: HandleOptions
): void {
  deps.handle(channel, schema, fn, options)
}

export function registerIpc(deps: IpcDeps): void {
  const none = z.undefined()
  const getAi = () => deps.settings.get('ai', aiSettingsSchema, DEFAULT_AI_SETTINGS)

  handle(deps, IPC.cliCheck, none, () =>
    deps.fakeCli ? { state: 'ok' as const, version: 'fake' } : checkClaudeCli()
  )

  // ---- Hội thoại & chat ----
  handle(deps, IPC.conversationsList, conversationListSchema, ({ query }) =>
    deps.conversations.list(query)
  )
  const conv = { changes: 'conversations' } as const
  handle(deps, IPC.conversationsCreate, conversationCreateSchema, ({ mode }) => deps.conversations.create(mode), conv)
  handle(
    deps,
    IPC.conversationsUpdate,
    conversationUpdateSchema,
    (input) => {
      const updated = deps.conversations.update(input)
      if (!updated) throw new Error('conversation_not_found')
      return updated
    },
    conv
  )
  handle(deps, IPC.conversationsRemove, idSchema, (id) => deps.conversations.remove(id), conv)
  handle(
    deps,
    IPC.conversationsFork,
    idSchema,
    (messageId) => {
      const forked = deps.conversations.fork(messageId)
      if (!forked) throw new Error('message_not_found')
      return forked
    },
    conv
  )
  handle(
    deps,
    IPC.conversationsAnswerSuggestion,
    conversationAnswerSuggestionSchema,
    ({ id, accept }) => {
      const updated = deps.conversations.answerSuggestion(id, accept)
      if (!updated) throw new Error('conversation_not_found')
      return updated
    },
    conv
  )

  // ---- Nhóm cuộc trò chuyện ----
  /** Trùng tên → trả { error } để renderer hoàn tác + báo, không ném. */
  const groupResult = <T>(fn: () => T): T | { error: string } => {
    try {
      return fn()
    } catch (err) {
      if (err instanceof GroupNameTakenError) return { error: err.message }
      throw err
    }
  }
  handle(deps, IPC.conversationGroupsList, none, () => deps.groups.list())
  handle(
    deps,
    IPC.conversationGroupsCreate,
    conversationGroupNameSchema,
    (name) => groupResult(() => deps.groups.create(name)),
    conv
  )
  handle(
    deps,
    IPC.conversationGroupsUpdate,
    conversationGroupUpdateSchema,
    (input) =>
      groupResult(() => {
        const updated = deps.groups.update(input)
        if (!updated) throw new Error('group_not_found')
        return updated
      }),
    conv
  )
  handle(deps, IPC.conversationGroupsRemove, idSchema, (id) => deps.groups.remove(id), conv)
  handle(deps, IPC.settingsGetChatOrganize, none, () =>
    deps.settings.get('chatOrganize', chatOrganizeSettingsSchema, DEFAULT_CHAT_ORGANIZE_SETTINGS)
  )
  handle(
    deps,
    IPC.settingsSetChatOrganize,
    chatOrganizeSettingsSchema,
    (s) => deps.settings.set('chatOrganize', s),
    conv
  )
  // Chỉ đọc tin nhắn trong hội thoại của tài khoản hiện tại.
  handle(deps, IPC.messagesList, idSchema, (conversationId) =>
    deps.conversations.get(conversationId) ? deps.messages.list(conversationId) : []
  )

  handle(
    deps,
    IPC.chatSend,
    chatSendSchema,
    async ({ conversationId, text, attachmentIds, media, voice }) => {
      const resolved = media ? await deps.resolveMedia(media) : null
      if (media && !resolved) throw new Error('media_not_found')
      // Tin giọng nói: chỉ nhận id ghi âm do chính main đã lưu.
      if (voice && !deps.hasRecording?.(voice.recordingId)) throw new Error('recording_not_found')
      return deps.chat.send(conversationId, text, deps.attachments.take(attachmentIds), resolved, voice ?? null)
    },
    // Tiêu đề tạm / gợi ý nhóm / thứ tự trên thanh bên đổi ngay khi gửi.
    conv
  )
  handle(deps, IPC.chatReact, chatReactSchema, ({ messageId, emoji }) =>
    deps.chat.react(messageId, emoji)
  )
  handle(deps, IPC.chatAbort, chatAbortSchema, ({ requestId }) => deps.chat.abort(requestId))
  handle(deps, IPC.chatPickAttachments, none, async () => {
    const win = deps.getWindow()
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Files', extensions: ATTACHMENT_EXTENSIONS }]
    }
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (picked.canceled) return { attachments: [], rejected: [] }
    return deps.attachments.add(picked.filePaths)
  })
  handle(deps, IPC.chatAddFile, chatAddFileSchema, ({ name, data }) =>
    deps.attachments.addBuffers([
      { name, data: Buffer.from(data.buffer, data.byteOffset, data.byteLength) }
    ])
  )
  handle(deps, IPC.chatPasteClipboard, none, () =>
    deps.attachments.addFromClipboard(deps.clipboard)
  )
  // Chỉ xem được ảnh đang chờ gửi hoặc nằm trong hội thoại của tài khoản hiện tại.
  handle(deps, IPC.chatAttachmentPreview, chatAttachmentPreviewSchema, async ({ id, size }) =>
    deps.attachments.isPending(id) || deps.conversations.hasAttachment(id)
      ? deps.attachments.preview(id, size)
      : null
  )

  // ---- Trí nhớ ----
  const mem = { changes: 'memory' } as const
  handle(deps, IPC.memoryGetProfile, none, () => deps.memory.getProfile())
  handle(deps, IPC.memorySetProfile, userProfileSchema, (p) => deps.memory.setProfile(p))
  handle(deps, IPC.memoryList, z.string().trim().max(200).optional(), (query) =>
    deps.memories.list(query)
  )
  handle(deps, IPC.memoryCreate, memoryCreateSchema, ({ content, category }) =>
    deps.memories.create(content, category)
  , mem)
  handle(deps, IPC.memoryUpdate, memoryUpdateSchema, ({ id, content, category }) => {
    const updated = deps.memories.update(id, content, category)
    if (!updated) throw new Error('memory_not_found')
    return updated
  }, mem)
  handle(deps, IPC.memoryRemove, idSchema, (id) => deps.memories.remove(id), mem)
  handle(deps, IPC.memorySuggestions, none, () => deps.suggestions.pending())
  handle(deps, IPC.memoryResolve, suggestionResolveSchema, (input) => deps.memory.resolve(input), mem)
  handle(deps, IPC.memoryResolveMany, suggestionResolveManySchema, (items) => deps.memory.resolveMany(items), mem)
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
    const target = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (target.canceled || !target.filePath) return null
    await writeFile(target.filePath, JSON.stringify(deps.memory.exportData(), null, 2), 'utf8')
    return target.filePath
  })

  // ---- Cài đặt ----
  // Tên/tính cách trợ lý theo tài khoản đang đăng nhập.
  handle(deps, IPC.settingsGetAssistant, none, () => deps.account.getAssistant())
  handle(deps, IPC.settingsSetAssistant, assistantProfileSchema, (p) => deps.account.setAssistant(p), {
    changes: 'assistant'
  })
  handle(deps, IPC.settingsGetAppearance, none, () =>
    deps.settings.get('appearance', appearanceSchema, DEFAULT_APPEARANCE)
  )
  handle(deps, IPC.settingsSetAppearance, appearanceSchema, (a) => deps.settings.set('appearance', a), {
    changes: 'appearance'
  })
  // Không bao giờ trả API key về renderer — chỉ báo có/không.
  handle(deps, IPC.settingsGetAi, none, () => ({
    ...getAi(),
    hasApiKey: deps.secrets.has(),
    secureStorage: deps.secrets.available
  }))
  const ai = { changes: 'ai' } as const
  handle(deps, IPC.settingsSetAi, aiSettingsSchema, (s) => deps.settings.set('ai', s), ai)
  handle(deps, IPC.settingsSetApiKey, apiKeySchema, (key) => deps.secrets.set(key), ai)
  handle(
    deps,
    IPC.settingsClearApiKey,
    none,
    () => {
      deps.secrets.clear()
      if (getAi().provider === 'anthropic-api')
        deps.settings.set('ai', { ...getAi(), provider: 'claude-cli' })
    },
    ai
  )

  handle(deps, IPC.appOpenExternal, externalUrlSchema, (url) => shell.openExternal(url))
}
