import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, exists, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { ChatMode, ChatUsage } from '@shared/ai'
import type { Conversation, ConversationUpdate, Message, MessageRole, MessageStatus, ToolEvent } from '@shared/types'
import type { AppDatabase } from './client'
import { conversations, messages, settings } from './schema'

type ConversationRow = typeof conversations.$inferSelect
type MessageRow = typeof messages.$inferSelect

const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  title: r.title,
  mode: r.mode,
  pinned: r.pinned,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt
})

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversationId,
  role: r.role,
  content: r.content,
  status: r.status,
  error: r.error,
  toolEvents: r.toolEvents,
  usage: r.usage ?? null,
  createdAt: r.createdAt
})

/** Escape ký tự đặc biệt của LIKE để tìm kiếm theo chuỗi người dùng nhập. */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export class ConversationRepository {
  constructor(private readonly db: AppDatabase) {}

  list(query?: string): Conversation[] {
    const q = query?.trim()
    const where = q
      ? or(
          sql`${conversations.title} LIKE ${likePattern(q)} ESCAPE '\\'`,
          exists(
            this.db
              .select({ one: sql`1` })
              .from(messages)
              .where(
                and(
                  eq(messages.conversationId, conversations.id),
                  sql`${messages.content} LIKE ${likePattern(q)} ESCAPE '\\'`
                )
              )
          )
        )
      : undefined
    return this.db
      .select()
      .from(conversations)
      .where(where)
      .orderBy(desc(conversations.pinned), desc(conversations.updatedAt))
      .all()
      .map(toConversation)
  }

  get(id: string): (Conversation & { cliSessionId: string | null; cwd: string | null }) | null {
    const row = this.db.select().from(conversations).where(eq(conversations.id, id)).get()
    return row ? { ...toConversation(row), cliSessionId: row.cliSessionId, cwd: row.cwd } : null
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

  insert(input: NewMessage): Message {
    const row = this.db
      .insert(messages)
      .values({
        id: randomUUID(),
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        status: input.status ?? 'done',
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
