import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { ChatMode, ChatUsage } from '@shared/ai'
import type { MemoryAction, MemoryCategory, SuggestionStatus, TimeEntryKind } from '@shared/schemas'
import type { MessageRole, MessageStatus, StoredAttachment, ToolEvent } from '@shared/types'

const now = sql`(unixepoch('subsec') * 1000)`

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull().default(now)
})

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    /** Tài khoản sở hữu (như memories.owner): mỗi tài khoản chỉ thấy lịch sử chat của mình. */
    owner: text('owner').notNull().default('local'),
    title: text('title').notNull().default(''),
    mode: text('mode').$type<ChatMode>().notNull().default('free'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    provider: text('provider').notNull().default('claude-cli'),
    cliSessionId: text('cli_session_id'),
    cwd: text('cwd'),
    /** Lần cuối trích đề xuất memory từ hội thoại này (tin sau mốc này là "mới"). */
    memoryExtractedAt: integer('memory_extracted_at'),
    /** Chế độ Code: người dùng đã bật rõ ràng cho phép sửa file (mỗi lần sửa vẫn phải duyệt). */
    codeWrite: integer('code_write', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now)
  },
  (t) => [index('conversations_updated_idx').on(t.pinned, t.updatedAt), index('conversations_owner_idx').on(t.owner)]
)

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').$type<MessageRole>().notNull(),
    content: text('content').notNull().default(''),
    status: text('status').$type<MessageStatus>().notNull().default('done'),
    error: text('error'),
    toolEvents: text('tool_events', { mode: 'json' }).$type<ToolEvent[]>().notNull().default([]),
    attachments: text('attachments', { mode: 'json' }).$type<StoredAttachment[]>().notNull().default([]),
    usage: text('usage', { mode: 'json' }).$type<ChatUsage>(),
    createdAt: integer('created_at').notNull().default(now)
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)]
)

export const memories = sqliteTable(
  'memories',
  {
    id: text('id').primaryKey(),
    /** Tài khoản sở hữu: id GitHub/Supabase của người đăng nhập, 'local' khi chưa đăng nhập. */
    owner: text('owner').notNull().default('local'),
    content: text('content').notNull(),
    category: text('category').$type<MemoryCategory>().notNull().default('other'),
    sourceConversationId: text('source_conversation_id'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
    lastUsedAt: integer('last_used_at')
  },
  (t) => [index('memories_updated_idx').on(t.updatedAt), index('memories_owner_idx').on(t.owner)]
)

/** Chấm công: lưu trên máy để dùng offline. ended_at null = đang bấm giờ (tối đa một). */
export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id'),
    projectId: text('project_id'),
    title: text('title').notNull(),
    projectName: text('project_name'),
    kind: text('kind').$type<TimeEntryKind>().notNull().default('timer'),
    note: text('note').notNull().default(''),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at')
  },
  (t) => [index('time_entries_started_idx').on(t.startedAt)]
)

export const memorySuggestions = sqliteTable(
  'memory_suggestions',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull().default('local'),
    conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    action: text('action').$type<MemoryAction>().notNull(),
    targetMemoryId: text('target_memory_id'),
    content: text('content').notNull().default(''),
    category: text('category').$type<MemoryCategory>().notNull().default('other'),
    status: text('status').$type<SuggestionStatus>().notNull().default('pending'),
    createdAt: integer('created_at').notNull().default(now)
  },
  (t) => [index('memory_suggestions_status_idx').on(t.status, t.createdAt)]
)
