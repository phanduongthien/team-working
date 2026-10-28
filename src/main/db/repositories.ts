import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gt, inArray, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { ChatMode, ChatUsage } from '@shared/ai'
import type { MemoryAction, MemoryCategory } from '@shared/schemas'
import type {
  Conversation,
  ConversationUpdate,
  Memory,
  MemorySuggestion,
  Message,
  MessageRole,
  MessageStatus,
  StoredAttachment,
  ToolEvent
} from '@shared/types'
import type { AppDatabase } from './client'
import { conversations, memories, memorySuggestions, messages, settings } from './schema'

type ConversationRow = typeof conversations.$inferSelect
type MessageRow = typeof messages.$inferSelect

const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  title: r.title,
  mode: r.mode,
  pinned: r.pinned,
  cwd: r.cwd,
  codeWrite: r.codeWrite,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt
})

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
  createdAt: r.createdAt
})

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

export class ConversationRepository {
  constructor(private readonly db: AppDatabase) {}

  list(query?: string): Conversation[] {
    const q = query?.trim()
    const match = q ? ftsQuery(q) : ''
    const titleLike = sql`${conversations.title} LIKE ${likePattern(q ?? '')} ESCAPE '\\'`
    const where = !q
      ? undefined
      : match
        ? or(
            titleLike,
            sql`${conversations.id} IN (SELECT conversation_id FROM messages_fts WHERE messages_fts MATCH ${match})`
          )
        : titleLike
    return this.db
      .select()
      .from(conversations)
      .where(where)
      .orderBy(desc(conversations.pinned), desc(conversations.updatedAt))
      .all()
      .map(toConversation)
  }

  get(id: string): (Conversation & { cliSessionId: string | null; memoryExtractedAt: number | null }) | null {
    const row = this.db.select().from(conversations).where(eq(conversations.id, id)).get()
    return row ? { ...toConversation(row), cliSessionId: row.cliSessionId, memoryExtractedAt: row.memoryExtractedAt } : null
  }

  /** Chọn thư mục dự án mới → tắt quyền sửa (phải bật lại cho thư mục mới). */
  setCwd(id: string, cwd: string): Conversation | null {
    const row = this.db.update(conversations).set({ cwd, codeWrite: false }).where(eq(conversations.id, id)).returning().get()
    return row ? toConversation(row) : null
  }

  setCodeWrite(id: string, enabled: boolean): Conversation | null {
    const row = this.db.update(conversations).set({ codeWrite: enabled }).where(eq(conversations.id, id)).returning().get()
    return row ? toConversation(row) : null
  }

  setMemoryExtractedAt(id: string, at: number): void {
    this.db.update(conversations).set({ memoryExtractedAt: at }).where(eq(conversations.id, id)).run()
  }

  create(mode: ChatMode): Conversation {
    const ts = Date.now()
    const row = this.db
      .insert(conversations)
      .values({ id: randomUUID(), mode, createdAt: ts, updatedAt: ts })
      .returning()
      .get()
    return toConversation(row)
  }

  update(input: ConversationUpdate): Conversation | null {
    const patch: Partial<ConversationRow> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.pinned !== undefined) patch.pinned = input.pinned
    if (input.mode !== undefined) patch.mode = input.mode
    if (Object.keys(patch).length === 0) {
      const row = this.db.select().from(conversations).where(eq(conversations.id, input.id)).get()
      return row ? toConversation(row) : null
    }
    // Đổi tên/ghim không đẩy hội thoại lên đầu; đổi chế độ thì có.
    if (input.mode !== undefined) patch.updatedAt = Date.now()
    const row = this.db.update(conversations).set(patch).where(eq(conversations.id, input.id)).returning().get()
    return row ? toConversation(row) : null
  }

  touch(id: string): void {
    this.db.update(conversations).set({ updatedAt: Date.now() }).where(eq(conversations.id, id)).run()
  }

  setSession(id: string, cliSessionId: string | null): void {
    this.db.update(conversations).set({ cliSessionId }).where(eq(conversations.id, id)).run()
  }

  remove(id: string): void {
    this.db.delete(conversations).where(eq(conversations.id, id)).run()
  }
}

export type NewMessage = {
  conversationId: string
  role: MessageRole
  content: string
  status?: MessageStatus
  attachments?: StoredAttachment[]
}

export type MessagePatch = {
  content?: string
  status?: MessageStatus
  error?: string | null
  toolEvents?: ToolEvent[]
  usage?: ChatUsage | null
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
        createdAt: Date.now()
      })
      .returning()
      .get()
    return toMessage(row)
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

export class MemoryRepository {
  constructor(private readonly db: AppDatabase) {}

  list(query?: string): Memory[] {
    const q = query?.trim()
    return this.db
      .select()
      .from(memories)
      .where(q ? sql`${memories.content} LIKE ${likePattern(q)} ESCAPE '\\'` : undefined)
      .orderBy(desc(memories.updatedAt))
      .all()
      .map(toMemory)
  }

  get(id: string): Memory | null {
    const row = this.db.select().from(memories).where(eq(memories.id, id)).get()
    return row ? toMemory(row) : null
  }

  create(content: string, category: MemoryCategory, sourceConversationId: string | null = null): Memory {
    const ts = Date.now()
    return toMemory(
      this.db
        .insert(memories)
        .values({ id: randomUUID(), content, category, sourceConversationId, createdAt: ts, updatedAt: ts })
        .returning()
        .get()
    )
  }

  update(id: string, content: string, category: MemoryCategory): Memory | null {
    const row = this.db
      .update(memories)
      .set({ content, category, updatedAt: Date.now() })
      .where(eq(memories.id, id))
      .returning()
      .get()
    return row ? toMemory(row) : null
  }

  remove(id: string): void {
    this.db.delete(memories).where(eq(memories.id, id)).run()
  }

  markUsed(ids: string[]): void {
    if (ids.length === 0) return
    this.db.update(memories).set({ lastUsedAt: Date.now() }).where(inArray(memories.id, ids)).run()
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
  constructor(private readonly db: AppDatabase) {}

  pending(): MemorySuggestion[] {
    const rows = this.db
      .select({ s: memorySuggestions, targetContent: memories.content })
      .from(memorySuggestions)
      .leftJoin(memories, eq(memories.id, memorySuggestions.targetMemoryId))
      .where(eq(memorySuggestions.status, 'pending'))
      .orderBy(asc(memorySuggestions.createdAt), asc(sql`memory_suggestions.rowid`))
      .all()
    return rows.map(({ s, targetContent }) => ({ ...s, targetContent: targetContent ?? null }))
  }

  countPending(): number {
    return this.db
      .select({ n: sql<number>`count(*)` })
      .from(memorySuggestions)
      .where(eq(memorySuggestions.status, 'pending'))
      .get()!.n
  }

  /** Chỉ đề xuất còn chờ duyệt mới xử lý được. */
  getPending(id: string): MemorySuggestion | null {
    return this.pending().find((s) => s.id === id) ?? null
  }

  insertMany(items: NewSuggestion[]): number {
    const ts = Date.now()
    for (const item of items) {
      this.db.insert(memorySuggestions).values({ id: randomUUID(), createdAt: ts, ...item }).run()
    }
    return items.length
  }

  setStatus(id: string, status: 'accepted' | 'rejected'): void {
    this.db.update(memorySuggestions).set({ status }).where(eq(memorySuggestions.id, id)).run()
  }
}

export class SettingsRepository {
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
    return value
  }
}
