import { create } from 'zustand'
import type { ChatMode } from '@shared/ai'
import type { MediaRef } from '@shared/expressive'
import type { MessageVoice } from '@shared/voice'
import type { ChatSendResult, ChatStreamPayload, Conversation, ConversationGroup, Message } from '@shared/types'
import { api } from '@renderer/lib/api'
import { coalesce, optimistic } from '@renderer/lib/sync'
import { applyChatEvent, isTerminalEvent } from './chatEvents'

type Streaming = { requestId: string; messageId: string }

/** Lỗi IPC có dạng "Error invoking remote method 'x': Error: code" → lấy phần code. */
export function errorCode(err: unknown): string {
  const message = (err as Error).message ?? String(err)
  return message.match(/Error: ([\w-]+)$/)?.[1] ?? message
}

/** Sự kiện tới trước khi `send` trả về (hiếm) — đệm lại theo messageId rồi áp sau. */
const early = new Map<string, ChatStreamPayload[]>()
/** Vừa cấp quyền thư mục giữa lượt → lượt xong thì tự gửi câu "tiếp tục" (tool CLI chỉ đổi từ lượt sau). */
const continueAfterRun = new Map<string, string>()

type ChatState = {
  conversations: Conversation[]
  groups: ConversationGroup[]
  query: string
  activeId: string | null
  messages: Record<string, Message[]>
  streaming: Record<string, Streaming>
  error: string | null

  loadConversations(): Promise<void>
  /** Hỏi lại danh sách + nhóm (gộp các lần gọi dồn dập) — dùng cho sync 'conversations'. */
  refreshSidebar(): Promise<void>
  setQuery(query: string): Promise<void>
  select(id: string | null): Promise<void>
  create(mode?: ChatMode): Promise<Conversation>
  rename(id: string, title: string): Promise<void>
  togglePin(id: string): Promise<void>
  /** Kéo thả / menu: chuyển vào nhóm (null = bỏ khỏi nhóm). `pinned` đổi kèm khi thả vào / ra mục Đã ghim. */
  moveTo(id: string, target: { groupId: string | null; pinned?: boolean }): Promise<void>
  /** Tách nhánh từ một tin → mở luôn cuộc mới. */
  fork(messageId: string): Promise<void>
  answerSuggestion(id: string, accept: boolean): Promise<void>
  /** Tạo nhóm; trả mã lỗi (vd group_name_taken) hoặc null. */
  createGroup(name: string): Promise<string | null>
  renameGroup(id: string, name: string): Promise<string | null>
  toggleGroup(id: string): Promise<void>
  removeGroup(id: string): Promise<void>
  setMode(id: string, mode: ChatMode): Promise<void>
  /** Chế độ Code: chọn thư mục dự án (tạo hội thoại mới nếu chưa có). */
  chooseFolder(): Promise<void>
  setCodeWrite(id: string, enabled: boolean): Promise<void>
  /** Gỡ thư mục = thu hồi quyền đọc/sửa của trợ lý. */
  clearFolder(id: string): Promise<void>
  /** Thẻ trợ lý xin quyền thư mục: grant → mở hộp chọn thư mục; cấp xong thì tự gửi `continueText` khi lượt kết thúc. */
  respondFolderAccess(
    request: { id: string; conversationId: string },
    grant: boolean,
    write: boolean,
    continueText: string
  ): Promise<'granted' | 'pending' | 'denied' | 'expired'>
  remove(id: string): Promise<void>
  send(
    text: string,
    mode: ChatMode,
    attachmentIds?: string[],
    media?: MediaRef,
    voice?: MessageVoice
  ): Promise<boolean>
  /** Thả / bỏ cảm xúc của người dùng cho một tin. */
  react(message: Message, emoji: string): Promise<void>
  /** Tin đang được trả lời (hiện trên ô nhập) theo từng hội thoại. */
  replyTo: Record<string, Message>
  setReplyTo(conversationId: string, message: Message | null): void
  /** Ghim / bỏ ghim — hiện ngay, lỗi thì hoàn tác + báo. */
  pin(message: Message, pinned: boolean): Promise<void>
  /** Thu hồi tin của người dùng. */
  recall(message: Message): Promise<void>
  /** Sửa & gửi lại: bỏ tin này và mọi tin sau nó, gửi nội dung mới. */
  editResend(message: Message, text: string): Promise<boolean>
  /** Tải lại tin của hội thoại đang mở (sync 'messages'); bỏ qua khi đang trả lời để không đè luồng stream. */
  reloadMessages(): Promise<void>
  stop(): Promise<void>
  handleEvent(payload: ChatStreamPayload): void
  clearError(): void
  /** Đổi tài khoản: bỏ lịch sử đang hiện, tải danh sách hội thoại của tài khoản mới. */
  switchAccount(): Promise<void>
}

export const useChat = create<ChatState>((set, get) => {
  const replaceConversation = (c: Conversation): void =>
    set((s) => ({ conversations: s.conversations.map((x) => (x.id === c.id ? c : x)) }))
  const patchConversation = (id: string, patch: Partial<Conversation>): void =>
    set((s) => ({ conversations: s.conversations.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
  /** Sửa một tin trong danh sách đang hiện. */
  const patchMessage = (message: Message, patch: Partial<Message>): void =>
    set((s) => ({
      messages: {
        ...s.messages,
        [message.conversationId]: (s.messages[message.conversationId] ?? []).map((m) =>
          m.id === message.id ? { ...m, ...patch } : m
        )
      }
    }))
  /** Lượt mới vừa gửi: thêm tin người dùng + tin trợ lý đang trả lời, áp sự kiện tới sớm. */
  const applySent = (conversationId: string, res: ChatSendResult): void => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: [...(s.messages[conversationId] ?? []), res.userMessage, res.assistantMessage]
      },
      streaming: {
        ...s.streaming,
        [conversationId]: { requestId: res.requestId, messageId: res.assistantMessage.id }
      }
    }))
    const buffered = early.get(res.assistantMessage.id) ?? []
    early.delete(res.assistantMessage.id)
    for (const payload of buffered) get().handleEvent(payload)
  }
  const patchGroup = (id: string, patch: Partial<ConversationGroup>): void =>
    set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }))
  /** Thao tác lạc quan trên một hội thoại: hiện ngay, lỗi → về lại bản cũ + báo. */
  const optimisticConversation = async (id: string, patch: Partial<Conversation>, save: () => Promise<unknown>) => {
    const before = get().conversations.find((c) => c.id === id)
    if (!before) return
    await optimistic({
      topic: 'conversations',
      apply: () => patchConversation(id, patch),
      rollback: () => replaceConversation(before),
      save
    })
  }
  const refresh = coalesce(async () => {
    const [conversations, groups] = await Promise.all([
      api.conversations.list(get().query || undefined),
      api.conversationGroups.list()
    ])
    set({ conversations, groups })
  })

  return {
    conversations: [],
    groups: [],
    query: '',
    activeId: null,
    messages: {},
    streaming: {},
    replyTo: {},
    error: null,

    async loadConversations() {
      await refresh()
    },

    refreshSidebar: () => refresh(),

    async setQuery(query) {
      set({ query })
      await get().loadConversations()
    },

    async select(id) {
      const previous = get().activeId
      // Rời cuộc trò chuyện cũ → main có thể tự đề xuất memory (nếu bật).
      if (previous && previous !== id) void api.memory.conversationLeft(previous)
      set({ activeId: id })
      if (id && !get().streaming[id]) {
        const list = await api.messages.list(id)
        set((s) => ({ messages: { ...s.messages, [id]: list } }))
      }
    },

    async create(mode = 'free') {
      const conv = await api.conversations.create(mode)
      set((s) => ({
        conversations: [conv, ...s.conversations],
        activeId: conv.id,
        messages: { ...s.messages, [conv.id]: [] }
      }))
      return conv
    },

    async rename(id, title) {
      await optimisticConversation(id, { title }, () => api.conversations.update({ id, title }))
    },

    async togglePin(id) {
      const conv = get().conversations.find((c) => c.id === id)
      if (!conv) return
      const pinned = !conv.pinned
      await optimisticConversation(id, { pinned }, () => api.conversations.update({ id, pinned }))
    },

    async moveTo(id, { groupId, pinned }) {
      const conv = get().conversations.find((c) => c.id === id)
      if (!conv) return
      const patch: Partial<Conversation> = { groupId, suggestedGroupId: null }
      if (pinned !== undefined) patch.pinned = pinned
      if (conv.groupId === groupId && (pinned === undefined || pinned === conv.pinned)) return
      await optimisticConversation(id, patch, () =>
        api.conversations.update({ id, groupId, ...(pinned === undefined ? {} : { pinned }) })
      )
    },

    async fork(messageId) {
      try {
        const conv = await api.conversations.fork(messageId)
        set((s) => ({ conversations: [conv, ...s.conversations.filter((c) => c.id !== conv.id)] }))
        await get().select(conv.id)
      } catch (err) {
        set({ error: errorCode(err) })
      }
    },

    async answerSuggestion(id, accept) {
      const conv = get().conversations.find((c) => c.id === id)
      if (!conv) return
      const patch: Partial<Conversation> = { suggestedGroupId: null }
      if (accept && conv.suggestedGroupId) patch.groupId = conv.suggestedGroupId
      await optimisticConversation(id, patch, () => api.conversations.answerSuggestion(id, accept))
    },

    async createGroup(name) {
      let code: string | null = null
      const tempId = `pending-${Date.now()}`
      await optimistic({
        topic: 'conversations',
        apply: () =>
          set((s) => ({ groups: [...s.groups, { id: tempId, name: name.trim(), collapsed: false, createdAt: Date.now() }] })),
        rollback: () => set((s) => ({ groups: s.groups.filter((g) => g.id !== tempId) })),
        save: () => api.conversationGroups.create(name),
        onError: (c) => {
          code = c
        }
      })
      return code
    },

    async renameGroup(id, name) {
      const before = get().groups.find((g) => g.id === id)
      if (!before) return null
      let code: string | null = null
      await optimistic({
        topic: 'conversations',
        apply: () => patchGroup(id, { name: name.trim() }),
        rollback: () => patchGroup(id, { name: before.name }),
        save: () => api.conversationGroups.update({ id, name }),
        onError: (c) => {
          code = c
        }
      })
      return code
    },

    async toggleGroup(id) {
      const before = get().groups.find((g) => g.id === id)
      if (!before) return
      const collapsed = !before.collapsed
      await optimistic({
        topic: 'conversations',
        apply: () => patchGroup(id, { collapsed }),
        rollback: () => patchGroup(id, { collapsed: before.collapsed }),
        save: () => api.conversationGroups.update({ id, collapsed })
      })
    },

    async removeGroup(id) {
      const { groups, conversations } = get()
      await optimistic({
        topic: 'conversations',
        apply: () =>
          set((s) => ({
            groups: s.groups.filter((g) => g.id !== id),
            conversations: s.conversations.map((c) => ({
              ...c,
              groupId: c.groupId === id ? null : c.groupId,
              suggestedGroupId: c.suggestedGroupId === id ? null : c.suggestedGroupId
            }))
          })),
        rollback: () => set({ groups, conversations }),
        save: () => api.conversationGroups.remove(id)
      })
    },

    async setMode(id, mode) {
      replaceConversation(await api.conversations.update({ id, mode }))
    },

    async chooseFolder() {
      let id = get().activeId
      // Thư mục gắn với cuộc trò chuyện ở mọi chế độ — không đổi chế độ.
      if (!id) id = (await get().create('code')).id
      const updated = await api.code.chooseFolder(id)
      if (updated) replaceConversation(updated)
    },

    async clearFolder(id) {
      try {
        const updated = await api.code.clearFolder(id)
        if (updated) replaceConversation(updated)
      } catch (err) {
        set({ error: errorCode(err) })
      }
    },

    async respondFolderAccess(request, grant, write, continueText) {
      try {
        const res = await api.code.respondFolderAccess(request.id, grant, write)
        if (res.status !== 'granted') return res.status
        replaceConversation(res.conversation)
        const { conversationId } = request
        // Lượt đang chạy sẽ kết thúc ngay sau khi tool trả lời → handleEvent gửi tiếp; đã xong thì gửi luôn.
        if (get().streaming[conversationId]) continueAfterRun.set(conversationId, continueText)
        else if (get().activeId === conversationId) void get().send(continueText, res.conversation.mode)
        return 'granted'
      } catch (err) {
        set({ error: errorCode(err) })
        return 'expired'
      }
    },

    async setCodeWrite(id, enabled) {
      try {
        replaceConversation(await api.code.setWrite(id, enabled))
      } catch (err) {
        set({ error: errorCode(err) })
      }
    },

    async remove(id) {
      const streaming = get().streaming[id]
      if (streaming) await api.chat.abort(streaming.requestId)
      await api.conversations.remove(id)
      set((s) => {
        const messages = { ...s.messages }
        delete messages[id]
        return {
          messages,
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: s.activeId === id ? null : s.activeId
        }
      })
    },

    async react(message, emoji) {
      const mine = message.reactions.find((r) => r.by === 'user')?.emoji
      try {
        const updated = await api.chat.react(message.id, mine === emoji ? null : emoji)
        set((s) => ({
          messages: {
            ...s.messages,
            [message.conversationId]: (s.messages[message.conversationId] ?? []).map((m) =>
              m.id === updated.id ? { ...m, reactions: updated.reactions } : m
            )
          }
        }))
      } catch (err) {
        set({ error: errorCode(err) })
      }
    },

    async send(text, mode, attachmentIds = [], media, voice) {
      let id = get().activeId
      if (!id) id = (await get().create(mode)).id
      else if (get().conversations.find((c) => c.id === id)?.mode !== mode)
        await get().setMode(id, mode)
      const conversationId = id

      try {
        // Trả lời một tin: chỉ với tin chữ / file (GIF, giọng nói gửi như tin thường).
        const replyToId = get().replyTo[conversationId]?.id
        const res = media
          ? await api.chat.sendMedia(conversationId, text, media)
          : voice
            ? await api.chat.sendVoice(conversationId, text, voice)
            : await api.chat.send(conversationId, text, attachmentIds, replyToId)
        if (!media && !voice) get().setReplyTo(conversationId, null)
        applySent(conversationId, res)
        // Danh sách (tiêu đề tạm, thứ tự) tự cập nhật qua sync 'conversations'.
        return true
      } catch (err) {
        set({ error: errorCode(err) })
        return false
      }
    },

    setReplyTo(conversationId, message) {
      set((s) => {
        const replyTo = { ...s.replyTo }
        if (message) replyTo[conversationId] = message
        else delete replyTo[conversationId]
        return { replyTo }
      })
    },

    async pin(message, pinned) {
      const pinnedAt = pinned ? Date.now() : null
      patchMessage(message, { pinnedAt })
      try {
        patchMessage(message, await api.chat.pin(message.id, pinned))
      } catch (err) {
        patchMessage(message, { pinnedAt: message.pinnedAt })
        set({ error: errorCode(err) })
      }
    },

    async recall(message) {
      try {
        patchMessage(message, await api.chat.recall(message.id))
        if (get().replyTo[message.conversationId]?.id === message.id) get().setReplyTo(message.conversationId, null)
      } catch (err) {
        set({ error: errorCode(err) })
      }
    },

    async editResend(message, text) {
      const { conversationId } = message
      try {
        const res = await api.chat.editResend(message.id, text)
        // Bỏ tin đã sửa và mọi tin sau nó (main đã xoá), rồi thêm lượt mới.
        set((s) => {
          const list = s.messages[conversationId] ?? []
          const cut = list.findIndex((m) => m.id === message.id)
          return { messages: { ...s.messages, [conversationId]: cut < 0 ? list : list.slice(0, cut) } }
        })
        applySent(conversationId, res)
        return true
      } catch (err) {
        set({ error: errorCode(err) })
        return false
      }
    },

    async reloadMessages() {
      const id = get().activeId
      if (!id || get().streaming[id]) return
      const list = await api.messages.list(id)
      if (get().activeId === id && !get().streaming[id]) set((s) => ({ messages: { ...s.messages, [id]: list } }))
    },

    async stop() {
      const id = get().activeId
      const streaming = id ? get().streaming[id] : undefined
      if (streaming) await api.chat.abort(streaming.requestId)
    },

    handleEvent(payload) {
      const { conversationId, messageId, event } = payload
      if (!get().messages[conversationId]?.some((m) => m.id === messageId)) {
        early.set(messageId, [...(early.get(messageId) ?? []), payload])
        return
      }
      set((s) => {
        const list = s.messages[conversationId] ?? []
        const next: Partial<ChatState> = {
          messages: { ...s.messages, [conversationId]: applyChatEvent(list, messageId, event) }
        }
        if (isTerminalEvent(event)) {
          const streaming = { ...s.streaming }
          delete streaming[conversationId]
          next.streaming = streaming
        }
        return next
      })
      const followUp = isTerminalEvent(event) ? continueAfterRun.get(conversationId) : undefined
      if (followUp !== undefined) {
        continueAfterRun.delete(conversationId)
        const conv = get().conversations.find((c) => c.id === conversationId)
        // send() gửi vào hội thoại đang mở — chỉ tự tiếp tục khi người dùng vẫn ở cuộc này.
        if (conv && get().activeId === conversationId) void get().send(followUp, conv.mode)
      }
    },

    clearError() {
      set({ error: null })
    },

    async switchAccount() {
      early.clear()
      set({
        conversations: [],
        groups: [],
        query: '',
        activeId: null,
        messages: {},
        streaming: {},
        replyTo: {},
        error: null
      })
      await get().loadConversations()
    }
  }
})
