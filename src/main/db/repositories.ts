import type { MessageArtifact } from '@shared/artifacts'
import type { MessageVoice } from '@shared/voice'
import type { MessageMedia, Reaction } from '@shared/expressive'
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gt, inArray, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { ChatMode, ChatUsage } from '@shared/ai'
import type { AgentExchange } from '@shared/agents'
import type { MemoryAction, MemoryCategory } from '@shared/schemas'
import type {
  Conversation,
  ConversationGroup,
  ConversationUpdate,
  Memory,
  MemorySuggestion,
  Message,
  MessageRole,
  MessageStatus,
  StoredAttachment,
  ToolEvent
} from '@shared/types'
import { SNIPPET_CLOSE, SNIPPET_OPEN } from '@shared/search'
import { normalize } from '../chat/organize'
import type { AppDatabase } from './client'
import {
  agentExchanges,
  conversationGroups,
  conversations,
  memories,
  memorySuggestions,
  messages,
  settings,
  type TitleSource
} from './schema'

type ConversationRow = typeof conversations.$inferSelect
type MessageRow = typeof messages.$inferSelect

const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  title: r.title,
  mode: r.mode,
  pinned: r.pinned,
  cwd: r.cwd,
  codeWrite: r.codeWrite,
  groupId: r.groupId,
  parentId: r.parentId,
  suggestedGroupId: r.suggestedGroupId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt
})

type GroupRow = typeof conversationGroups.$inferSelect
const toGroup = (r: GroupRow): ConversationGroup => ({
  id: r.id,
  name: r.name,
  collapsed: r.collapsed,
  createdAt: r.createdAt
})

/** So tên nhóm không phân biệt hoa thường / dấu ("Học" = "hoc"). */
export const groupKey = (name: string): string => normalize(name).trim()

/** Renderer không cần (và không được thấy) đường dẫn file trên máy. */
const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversationId,
  role: r.role,
  content: r.content,
  status: r.status,
  error: r.error,
  toolEvents: r.toolEvents,
  attachments: r.attachments.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })),
  usage: r.usage ?? null,
  reactions: r.reactions ?? [],
  media: r.media ?? null,
  voice: r.voice ?? null,
  artifacts: r.artifacts ?? [],
  createdAt: r.createdAt
})

/**
 * Trích đoạn kết quả tìm: bỏ ký hiệu Markdown / xuống dòng, giữ dấu đánh dấu chữ khớp
 * (SNIPPET_OPEN / SNIPPET_CLOSE — ký tự điều khiển, không bao giờ có trong tin nhắn thường).
 */
export function cleanSnippet(snippet: string): string {
  return snippet
    .replace(/```[a-z]*|\*+|__+|`+|\[\[[^\]]*\]\]/gi, '')
    // Đầu dòng tiêu đề / trích dẫn Markdown (giữ "C#", "a > b" giữa câu).
    .replace(/(^|\n)\s*(#{1,6}|>)\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Escape ký tự đặc biệt của LIKE để tìm kiếm theo chuỗi người dùng nhập. */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/**
 * Chuỗi người dùng nhập → truy vấn FTS5 an toàn: mỗi từ thành cụm "từ"* (khớp tiền tố),
 * các từ nối bằng AND. Bỏ ký tự cú pháp FTS để không lỗi/không bị chèn toán tử.
 */
export function ftsQuery(input: string): string {
  return input
    .replace(/["*^:(){}[\]]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !/^(AND|OR|NOT|NEAR)$/.test(t))
    .map((t) => `"${t}"*`)
    .join(' ')
}

/**
 * Lịch sử chat theo TÀI KHOẢN (như MemoryRepository): đọc/sửa/xóa chỉ trong hội thoại của
 * người đang đăng nhập. touch/setSession/setMemoryExtractedAt theo id, chỉ gọi nội bộ.
 */
export class ConversationRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly getOwner: () => string = () => LOCAL_OWNER
  ) {}

  private mine(id?: string) {
    return and(eq(conversations.owner, this.getOwner()), id === undefined ? undefined : eq(conversations.id, id))
  }

  list(query?: string): Conversation[] {
    const q = query?.trim()
    const match = q ? ftsQuery(q) : ''
    const pattern = likePattern(q ?? '')
    const titleLike = sql`${conversations.title} LIKE ${pattern} ESCAPE '\\'`
    // Tìm được cả theo tên nhóm: gõ "Unity" → mọi cuộc trong nhóm Unity.
    const groupLike = sql`${conversations.groupId} IN (SELECT id FROM conversation_groups WHERE owner = ${this.getOwner()} AND name LIKE ${pattern} ESCAPE '\\')`
    const where = !q
      ? undefined
      : match
        ? or(
            titleLike,
            groupLike,
            sql`${conversations.id} IN (SELECT conversation_id FROM messages_fts WHERE messages_fts MATCH ${match})`
          )
        : or(titleLike, groupLike)
    if (!match)
      return this.db
        .select()
        .from(conversations)
        .where(and(this.mine(), where))
        .orderBy(desc(conversations.pinned), desc(conversations.updatedAt))
        .all()
        .map(toConversation)
    // Khớp trong nội dung tin nhắn (không phải tiêu đề) → kèm trích đoạn để người dùng hiểu vì sao cuộc này hiện ra.
    return this.db
      .select({
        row: conversations,
        titleHit: sql<number>`${titleLike}`,
        snippet: sql<string | null>`(SELECT snippet(messages_fts, 0, ${SNIPPET_OPEN}, ${SNIPPET_CLOSE}, '…', 10) FROM messages_fts WHERE messages_fts MATCH ${match} AND conversation_id = ${conversations.id} ORDER BY rowid DESC LIMIT 1)`
      })
      .from(conversations)
      .where(and(this.mine(), where))
      .orderBy(desc(conversations.pinned), desc(conversations.updatedAt))
      .all()
      .map(({ row, titleHit, snippet }) => ({
        ...toConversation(row),
        searchSnippet: !titleHit && snippet ? cleanSnippet(snippet) : null
      }))
  }

  get(
    id: string
  ):
    | (Conversation & {
        cliSessionId: string | null
        memoryExtractedAt: number | null
        titleSource: TitleSource
        forkedFromMessageId: string | null
      })
    | null {
    const row = this.db.select().from(conversations).where(this.mine(id)).get()
    return row
      ? {
          ...toConversation(row),
          cliSessionId: row.cliSessionId,
          memoryExtractedAt: row.memoryExtractedAt,
          titleSource: row.titleSource,
          forkedFromMessageId: row.forkedFromMessageId
        }
      : null
  }

  /** Tiêu đề do app / AI đặt (không phải người dùng đổi tên). `auto` = AI còn được đặt lại. */
  setAutoTitle(id: string, title: string, source: Exclude<TitleSource, 'user'>): void {
    this.db.update(conversations).set({ title, titleSource: source }).where(eq(conversations.id, id)).run()
  }

  /** Gợi ý nhóm (null = bỏ gợi ý). */
  setSuggestedGroup(id: string, groupId: string | null): void {
    this.db.update(conversations).set({ suggestedGroupId: groupId }).where(eq(conversations.id, id)).run()
  }

  /** Người dùng trả lời gợi ý nhóm: đồng ý → chuyển vào nhóm; luôn xoá gợi ý. */
  answerSuggestion(id: string, accept: boolean): Conversation | null {
    const row = this.db.select().from(conversations).where(this.mine(id)).get()
    if (!row) return null
    const patch: Partial<ConversationRow> = { suggestedGroupId: null }
    if (accept && row.suggestedGroupId) patch.groupId = row.suggestedGroupId
    const updated = this.db.update(conversations).set(patch).where(this.mine(id)).returning().get()
    return updated ? toConversation(updated) : null
  }

  /**
   * Tách nhánh từ một tin: hội thoại mới (cùng chế độ / thư mục / nhóm) có bản sao các tin tới tin đó.
   * Không có session CLI → lượt đầu gửi kèm lịch sử (ChatService) để trợ lý nắm ngữ cảnh.
   */
  fork(messageId: string): Conversation | null {
    const target = this.db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(this.mine(), eq(messages.id, messageId)))
      .get()
    if (!target) return null
    const parent = this.db.select().from(conversations).where(this.mine(target.conversationId)).get()
    if (!parent) return null
    return this.db.transaction((tx) => {
      const ts = Date.now()
      const row = tx
        .insert(conversations)
        .values({
          id: randomUUID(),
          owner: parent.owner,
          title: parent.title,
          titleSource: 'fixed',
          mode: parent.mode,
          cwd: parent.cwd,
          groupId: parent.groupId,
          parentId: parent.id,
          forkedFromMessageId: messageId,
          createdAt: ts,
          updatedAt: ts
        })
        .returning()
        .get()
      const list = tx
        .select()
        .from(messages)
        .where(eq(messages.conversationId, parent.id))
        .orderBy(asc(messages.createdAt))
        .all()
      const upTo = list.findIndex((m) => m.id === messageId)
      for (const m of list.slice(0, upTo + 1)) {
        // Tin đang chạy coi như đã dừng; artifact thuộc hội thoại gốc nên bỏ thẻ.
        tx.insert(messages)
          .values({
            ...m,
            id: randomUUID(),
            conversationId: row.id,
            status: m.status === 'streaming' ? 'aborted' : m.status,
            artifacts: []
          })
          .run()
      }
      return toConversation(row)
    })
  }

  /** File đính kèm (theo ID) nằm trong một tin nhắn thuộc hội thoại của tài khoản hiện tại. */
  hasAttachment(attachmentId: string): boolean {
    // attachmentId đã được zod kiểm tra là UUID nên không có ký tự đặc biệt của LIKE.
    const row = this.db
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(this.mine(), sql`${messages.attachments} LIKE ${`%"id":"${attachmentId}"%`}`))
      .get()
    return !!row
  }

  /** Chọn thư mục dự án mới → tắt quyền sửa (phải bật lại cho thư mục mới). */
  setCwd(id: string, cwd: string): Conversation | null {
    const row = this.db.update(conversations).set({ cwd, codeWrite: false }).where(this.mine(id)).returning().get()
    return row ? toConversation(row) : null
  }

  setCodeWrite(id: string, enabled: boolean): Conversation | null {
    const row = this.db.update(conversations).set({ codeWrite: enabled }).where(this.mine(id)).returning().get()
    return row ? toConversation(row) : null
  }

  setMemoryExtractedAt(id: string, at: number): void {
    this.db.update(conversations).set({ memoryExtractedAt: at }).where(eq(conversations.id, id)).run()
  }

  create(mode: ChatMode): Conversation {
    const ts = Date.now()
    const row = this.db
      .insert(conversations)
      .values({ id: randomUUID(), owner: this.getOwner(), mode, createdAt: ts, updatedAt: ts })
      .returning()
      .get()
    return toConversation(row)
  }

  update(input: ConversationUpdate): Conversation | null {
    const patch: Partial<ConversationRow> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.pinned !== undefined) patch.pinned = input.pinned
    if (input.mode !== undefined) patch.mode = input.mode
    // Người dùng tự đổi tên → AI không đặt lại nữa.
    if (input.title !== undefined) patch.titleSource = 'user'
    if (input.groupId !== undefined) {
      // Chỉ nhóm của chính tài khoản này.
      if (input.groupId !== null && !this.ownsGroup(input.groupId)) return null
      patch.groupId = input.groupId
      // Đã tự xếp nhóm → bỏ gợi ý.
      patch.suggestedGroupId = null
    }
    if (Object.keys(patch).length === 0) {
      const row = this.db.select().from(conversations).where(this.mine(input.id)).get()
      return row ? toConversation(row) : null
    }
    // Đổi tên/ghim không đẩy hội thoại lên đầu; đổi chế độ thì có.
    if (input.mode !== undefined) patch.updatedAt = Date.now()
    const row = this.db.update(conversations).set(patch).where(this.mine(input.id)).returning().get()
    return row ? toConversation(row) : null
  }

  touch(id: string): void {
    this.db.update(conversations).set({ updatedAt: Date.now() }).where(eq(conversations.id, id)).run()
  }

  setSession(id: string, cliSessionId: string | null): void {
    this.db.update(conversations).set({ cliSessionId }).where(eq(conversations.id, id)).run()
  }

  /** Bảo trì nội bộ (mọi tài khoản): hội thoại có tiêu đề kiểu lệnh tạo artifact của bản cũ. */
  listAllForMaintenance(): { id: string; title: string; titleSource: TitleSource }[] {
    return this.db
      .select({ id: conversations.id, title: conversations.title, titleSource: conversations.titleSource })
      .from(conversations)
      .where(sql`lower(${conversations.title}) LIKE '%artifact%'`)
      .all()
  }

  private ownsGroup(groupId: string): boolean {
    return !!this.db
      .select({ id: conversationGroups.id })
      .from(conversationGroups)
      .where(and(eq(conversationGroups.id, groupId), eq(conversationGroups.owner, this.getOwner())))
      .get()
  }

  remove(id: string): void {
    if (!this.get(id)) return
    this.db.transaction((tx) => {
      // Nhánh con thành hội thoại thường (không mất theo gốc).
      tx.update(conversations).set({ parentId: null }).where(eq(conversations.parentId, id)).run()
      tx.delete(conversations).where(this.mine(id)).run()
    })
  }

  countFor(owner: string): number {
    return this.db.select({ n: sql<number>`count(*)` }).from(conversations).where(eq(conversations.owner, owner)).get()!.n
  }

  reassign(from: string, to: string): void {
    this.db.update(conversations).set({ owner: to }).where(eq(conversations.owner, from)).run()
    // Nhóm đi cùng lịch sử chat.
    this.db.update(conversationGroups).set({ owner: to }).where(eq(conversationGroups.owner, from)).run()
  }
}

export class GroupNameTakenError extends Error {
  constructor() {
    super('group_name_taken')
  }
}

/** Nhóm cuộc trò chuyện theo tài khoản. Tên không trùng (so không dấu, không phân biệt hoa thường). */
export class ConversationGroupRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly getOwner: () => string = () => LOCAL_OWNER
  ) {}

  private mine(id?: string) {
    return and(eq(conversationGroups.owner, this.getOwner()), id === undefined ? undefined : eq(conversationGroups.id, id))
  }

  list(): ConversationGroup[] {
    return this.db
      .select()
      .from(conversationGroups)
      .where(this.mine())
      .orderBy(asc(conversationGroups.createdAt), asc(conversationGroups.id))
      .all()
      .map(toGroup)
  }

  get(id: string): ConversationGroup | null {
    const row = this.db.select().from(conversationGroups).where(this.mine(id)).get()
    return row ? toGroup(row) : null
  }

  private taken(name: string, except?: string): boolean {
    const key = groupKey(name)
    return this.list().some((g) => g.id !== except && groupKey(g.name) === key)
  }

  create(name: string): ConversationGroup {
    if (this.taken(name)) throw new GroupNameTakenError()
    const row = this.db
      .insert(conversationGroups)
      .values({ id: randomUUID(), owner: this.getOwner(), name: name.trim(), createdAt: Date.now() })
      .returning()
      .get()
    return toGroup(row)
  }

  update(input: { id: string; name?: string; collapsed?: boolean }): ConversationGroup | null {
    const patch: Partial<GroupRow> = {}
    if (input.name !== undefined) {
      if (this.taken(input.name, input.id)) throw new GroupNameTakenError()
      patch.name = input.name.trim()
    }
    if (input.collapsed !== undefined) patch.collapsed = input.collapsed
    if (Object.keys(patch).length === 0) return this.get(input.id)
    const row = this.db.update(conversationGroups).set(patch).where(this.mine(input.id)).returning().get()
    return row ? toGroup(row) : null
  }

  /** Xoá nhóm: cuộc trò chuyện ra khỏi nhóm (KHÔNG bị xoá); gợi ý trỏ tới nhóm này cũng bỏ. */
  remove(id: string): void {
    if (!this.get(id)) return
    this.db.transaction((tx) => {
      tx.update(conversations).set({ groupId: null }).where(eq(conversations.groupId, id)).run()
      tx.update(conversations).set({ suggestedGroupId: null }).where(eq(conversations.suggestedGroupId, id)).run()
      tx.delete(conversationGroups).where(this.mine(id)).run()
    })
  }
}

export type NewMessage = {
  conversationId: string
  role: MessageRole
  content: string
  status?: MessageStatus
  attachments?: StoredAttachment[]
  media?: MessageMedia | null
  voice?: MessageVoice | null
}

export type MessagePatch = {
  content?: string
  status?: MessageStatus
  error?: string | null
  toolEvents?: ToolEvent[]
  usage?: ChatUsage | null
  reactions?: Reaction[]
  media?: MessageMedia | null
  artifacts?: MessageArtifact[]
}

export class MessageRepository {
  constructor(private readonly db: AppDatabase) {}

  list(conversationId: string): Message[] {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt), asc(sql`rowid`))
      .all()
      .map(toMessage)
  }

  /** N tin nhắn gần nhất (theo thứ tự thời gian) — dùng khi phải dựng lại ngữ cảnh. */
  recent(conversationId: string, limit: number): Message[] {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt), desc(sql`rowid`))
      .limit(limit)
      .all()
      .map(toMessage)
      .reverse()
  }

  /** Tin nhắn tạo sau mốc thời gian (null = tất cả), theo thứ tự thời gian. */
  since(conversationId: string, after: number | null): Message[] {
    return this.db
      .select()
      .from(messages)
      .where(
        and(eq(messages.conversationId, conversationId), after === null ? undefined : gt(messages.createdAt, after))
      )
      .orderBy(asc(messages.createdAt), asc(sql`rowid`))
      .all()
      .map(toMessage)
  }

  insert(input: NewMessage): Message {
    const row = this.db
      .insert(messages)
      .values({
        id: randomUUID(),
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        status: input.status ?? 'done',
        attachments: input.attachments ?? [],
        media: input.media ?? null,
        voice: input.voice ?? null,
        createdAt: Date.now()
      })
      .returning()
      .get()
    return toMessage(row)
  }

  get(id: string): Message | null {
    const row = this.db.select().from(messages).where(eq(messages.id, id)).get()
    return row ? toMessage(row) : null
  }

  update(id: string, patch: MessagePatch): void {
    if (Object.keys(patch).length === 0) return
    this.db.update(messages).set(patch).where(eq(messages.id, id)).run()
  }

  /** Tin nhắn còn 'streaming' khi app tắt đột ngột → đánh dấu bị dừng. */
  markInterrupted(): number {
    return this.db
      .update(messages)
      .set({ status: 'aborted' })
      .where(eq(messages.status, 'streaming'))
      .run().changes
  }
}

type MemoryRow = typeof memories.$inferSelect

const toMemory = (r: MemoryRow): Memory => ({
  id: r.id,
  content: r.content,
  category: r.category,
  sourceConversationId: r.sourceConversationId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  lastUsedAt: r.lastUsedAt
})

/** Chủ sở hữu dữ liệu cá nhân trên máy khi chưa đăng nhập. */
export const LOCAL_OWNER = 'local'

/**
 * Trí nhớ cá nhân theo TÀI KHOẢN: mọi truy vấn đều lọc theo người đang đăng nhập (getOwner),
 * nên hai người dùng chung máy không thấy trí nhớ của nhau.
 */
export class MemoryRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly getOwner: () => string = () => LOCAL_OWNER
  ) {}

  private mine() {
    return eq(memories.owner, this.getOwner())
  }

  list(query?: string): Memory[] {
    const q = query?.trim()
    return this.db
      .select()
      .from(memories)
      .where(and(this.mine(), q ? sql`${memories.content} LIKE ${likePattern(q)} ESCAPE '\\'` : undefined))
      .orderBy(desc(memories.updatedAt))
      .all()
      .map(toMemory)
  }

  get(id: string): Memory | null {
    const row = this.db.select().from(memories).where(and(this.mine(), eq(memories.id, id))).get()
    return row ? toMemory(row) : null
  }

  create(content: string, category: MemoryCategory, sourceConversationId: string | null = null): Memory {
    const ts = Date.now()
    return toMemory(
      this.db
        .insert(memories)
        .values({ id: randomUUID(), owner: this.getOwner(), content, category, sourceConversationId, createdAt: ts, updatedAt: ts })
        .returning()
        .get()
    )
  }

  update(id: string, content: string, category: MemoryCategory): Memory | null {
    const row = this.db
      .update(memories)
      .set({ content, category, updatedAt: Date.now() })
      .where(and(this.mine(), eq(memories.id, id)))
      .returning()
      .get()
    return row ? toMemory(row) : null
  }

  remove(id: string): void {
    this.db.delete(memories).where(and(this.mine(), eq(memories.id, id))).run()
  }

  markUsed(ids: string[]): void {
    if (ids.length === 0) return
    this.db.update(memories).set({ lastUsedAt: Date.now() }).where(and(this.mine(), inArray(memories.id, ids))).run()
  }

  countFor(owner: string): number {
    return this.db.select({ n: sql<number>`count(*)` }).from(memories).where(eq(memories.owner, owner)).get()!.n
  }

  /** Chuyển dữ liệu của chủ sở hữu `from` sang `to` (dùng khi nhận dữ liệu tạo trước lúc đăng nhập). */
  reassign(from: string, to: string): void {
    this.db.update(memories).set({ owner: to }).where(eq(memories.owner, from)).run()
    this.db.update(memorySuggestions).set({ owner: to }).where(eq(memorySuggestions.owner, from)).run()
  }
}

export type NewSuggestion = {
  conversationId: string | null
  action: MemoryAction
  targetMemoryId: string | null
  content: string
  category: MemoryCategory
}

export class SuggestionRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly getOwner: () => string = () => LOCAL_OWNER
  ) {}

  private minePending() {
    return and(eq(memorySuggestions.owner, this.getOwner()), eq(memorySuggestions.status, 'pending'))
  }

  pending(): MemorySuggestion[] {
    const rows = this.db
      .select({ s: memorySuggestions, targetContent: memories.content })
      .from(memorySuggestions)
      .leftJoin(memories, and(eq(memories.id, memorySuggestions.targetMemoryId), eq(memories.owner, memorySuggestions.owner)))
      .where(this.minePending())
      .orderBy(asc(memorySuggestions.createdAt), asc(sql`memory_suggestions.rowid`))
      .all()
    return rows.map(({ s: { owner: _owner, ...s }, targetContent }) => ({ ...s, targetContent: targetContent ?? null }))
  }

  countPending(): number {
    return this.db
      .select({ n: sql<number>`count(*)` })
      .from(memorySuggestions)
      .where(this.minePending())
      .get()!.n
  }

  /** Chỉ đề xuất còn chờ duyệt mới xử lý được. */
  getPending(id: string): MemorySuggestion | null {
    return this.pending().find((s) => s.id === id) ?? null
  }

  insertMany(items: NewSuggestion[]): number {
    const ts = Date.now()
    for (const item of items) {
      this.db.insert(memorySuggestions).values({ id: randomUUID(), owner: this.getOwner(), createdAt: ts, ...item }).run()
    }
    return items.length
  }

  setStatus(id: string, status: 'accepted' | 'rejected'): void {
    this.db
      .update(memorySuggestions)
      .set({ status })
      .where(and(eq(memorySuggestions.owner, this.getOwner()), eq(memorySuggestions.id, id)))
      .run()
  }
}

export class SettingsRepository {
  /** Gọi sau mỗi lần ghi (đồng bộ trạng thái: StateSync.settingsChanged). */
  onChange?: (key: string) => void

  constructor(private readonly db: AppDatabase) {}

  /** Đọc giá trị, validate bằng zod; sai/thiếu thì trả mặc định. */
  get<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get()
    if (!row) return fallback
    const parsed = schema.safeParse(row.value)
    return parsed.success ? parsed.data : fallback
  }

  set<T>(key: string, value: T): T {
    this.db
      .insert(settings)
      .values({ key, value, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: Date.now() } })
      .run()
    this.onChange?.(key)
    return value
  }
}

/** Lịch sử trao đổi với agent khác (Kết nối agent). */
export class AgentExchangeRepository {
  /** Gọi sau mỗi lần thêm / sửa — trang "Lịch sử trao đổi" cập nhật ngay, không cần hỏi định kỳ. */
  onChange?: () => void

  constructor(private readonly db: AppDatabase) {}

  insert(e: AgentExchange): void {
    this.db.insert(agentExchanges).values(e).run()
    this.onChange?.()
  }

  update(id: string, patch: Partial<AgentExchange>): void {
    const { id: _id, ...rest } = patch
    if (!Object.keys(rest).length) return
    this.db.update(agentExchanges).set(rest).where(eq(agentExchanges.id, id)).run()
    this.onChange?.()
  }

  get(id: string): AgentExchange | null {
    return (this.db.select().from(agentExchanges).where(eq(agentExchanges.id, id)).get() as AgentExchange | undefined) ?? null
  }

  list(limit: number, clientId?: string): AgentExchange[] {
    return this.db
      .select()
      .from(agentExchanges)
      .where(clientId ? eq(agentExchanges.clientId, clientId) : undefined)
      .orderBy(desc(agentExchanges.createdAt), desc(sql`rowid`))
      .limit(limit)
      .all() as AgentExchange[]
  }

  /** Lỡ thoát app giữa chừng → việc đang chờ/chạy coi như lỗi. */
  markInterrupted(): number {
    return this.db
      .update(agentExchanges)
      .set({ status: 'error', error: 'interrupted' })
      .where(inArray(agentExchanges.status, ['queued', 'running']))
      .run().changes
  }
}
