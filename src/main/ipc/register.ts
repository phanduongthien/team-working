import { ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import {
  DEFAULT_APPEARANCE,
  DEFAULT_ASSISTANT,
  appearanceSchema,
  assistantProfileSchema,
  chatAbortSchema,
  chatSendSchema,
  conversationCreateSchema,
  conversationListSchema,
  conversationUpdateSchema,
  externalUrlSchema,
  idSchema
} from '@shared/schemas'
import { checkClaudeCli } from '../ai/claudeCli'
import type { ConversationRepository, MessageRepository, SettingsRepository } from '../db/repositories'
import type { ChatService } from '../services/chatService'
import type { Logger } from '../services/logger'

export type IpcDeps = {
  conversations: ConversationRepository
  messages: MessageRepository
  settings: SettingsRepository
  chat: ChatService
  log: Logger
  /** Chỉ chấp nhận IPC từ cửa sổ của app. */
  isTrustedSender(event: IpcMainInvokeEvent): boolean
}

/** Đăng ký handler: kiểm tra sender, validate input bằng zod rồi mới gọi logic. */
function handle<S extends z.ZodType, R>(
  deps: IpcDeps,
  channel: string,
  schema: S,
  fn: (input: z.infer<S>) => R | Promise<R>
): void {
  ipcMain.handle(channel, async (event, raw: unknown) => {
    if (!deps.isTrustedSender(event)) throw new Error('untrusted_sender')
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      deps.log.warn(`IPC ${channel} input không hợp lệ: ${parsed.error.message}`)
      throw new Error('invalid_input')
    }
    return fn(parsed.data)
  })
}

export function registerIpc(deps: IpcDeps): void {
  const none = z.undefined()

  handle(deps, IPC.cliCheck, none, () => checkClaudeCli())

  handle(deps, IPC.conversationsList, conversationListSchema, ({ query }) => deps.conversations.list(query))
  handle(deps, IPC.conversationsCreate, conversationCreateSchema, ({ mode }) => deps.conversations.create(mode))
  handle(deps, IPC.conversationsUpdate, conversationUpdateSchema, (input) => {
    const updated = deps.conversations.update(input)
    if (!updated) throw new Error('conversation_not_found')
    return updated
  })
  handle(deps, IPC.conversationsRemove, idSchema, (id) => deps.conversations.remove(id))

  handle(deps, IPC.messagesList, idSchema, (conversationId) => deps.messages.list(conversationId))

  handle(deps, IPC.chatSend, chatSendSchema, ({ conversationId, text }) => deps.chat.send(conversationId, text))
  handle(deps, IPC.chatAbort, chatAbortSchema, ({ requestId }) => deps.chat.abort(requestId))

  handle(deps, IPC.settingsGetAssistant, none, () =>
    deps.settings.get('assistant', assistantProfileSchema, DEFAULT_ASSISTANT)
  )
  handle(deps, IPC.settingsSetAssistant, assistantProfileSchema, (p) => deps.settings.set('assistant', p))
  handle(deps, IPC.settingsGetAppearance, none, () =>
    deps.settings.get('appearance', appearanceSchema, DEFAULT_APPEARANCE)
  )
  handle(deps, IPC.settingsSetAppearance, appearanceSchema, (a) => deps.settings.set('appearance', a))

  handle(deps, IPC.appOpenExternal, externalUrlSchema, (url) => shell.openExternal(url))
}
