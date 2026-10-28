import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { ChatMode, ChatUsage } from '@shared/ai'
import type { MemoryAction, MemoryCategory, SuggestionStatus } from '@shared/schemas'
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
    title: text('title').notNull().default(''),
    mode: text('mode').$type<ChatMode>().notNull().default('free'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    provider: text('provider').notNull().default('claude-cli'),
    cliSessionId: text('cli_session_id'),
    cwd: text('cwd'),
    /** Lần cuối trích đề xuất memory từ hội thoại này (tin sau mốc này là "mới"). */
    memoryExtractedAt: integer('memory_extracted_at'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now)
  },
  (t) => [index('conversations_updated_idx').on(t.pinned, t.updatedAt)]
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
    content: text('content').notNull(),
    category: text('category').$type<MemoryCategory>().notNull().default('other'),
    sourceConversationId: text('source_conversation_id'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
    lastUsedAt: integer('last_used_at')
  },
  (t) => [index('memories_updated_idx').on(t.updatedAt)]
)

export const memorySuggestions = sqliteTable(
  'memory_suggestions',
  {
    id: text('id').primaryKey(),
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
