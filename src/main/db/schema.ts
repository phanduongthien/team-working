import type { ArtifactType, MessageArtifact } from '@shared/artifacts'
import type { MessageVoice } from '@shared/voice'
import type { MessageMedia, Reaction } from '@shared/expressive'
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { ChatMode, ChatUsage } from '@shared/ai'
import type { MemoryAction, MemoryCategory, SuggestionStatus, TimeEntryKind } from '@shared/schemas'
import type { MessageRole, MessageStatus, StoredAttachment, ToolEvent } from '@shared/types'

export type TitleSource = 'auto' | 'ai' | 'user' | 'fixed'

const now = sql`(unixepoch('subsec') * 1000)`

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull().default(now)
})

/** Nhóm cuộc trò chuyện ở thanh bên (vd "Unity", "Học") — chỉ trên máy, theo tài khoản. */
export const conversationGroups = sqliteTable(
  'conversation_groups',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull().default('local'),
    name: text('name').notNull(),
    collapsed: integer('collapsed', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull().default(now)
  },
  (t) => [index('conversation_groups_owner_idx').on(t.owner, t.createdAt)]
)

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
    groupId: text('group_id').references(() => conversationGroups.id, { onDelete: 'set null' }),
    /** Nhánh (fork): hội thoại gốc + tin được tách ra. Xoá gốc → nhánh thành hội thoại thường. */
    parentId: text('parent_id').references((): AnySQLiteColumn => conversations.id, { onDelete: 'set null' }),
    forkedFromMessageId: text('forked_from_message_id'),
    /** auto = tạm lấy từ tin đầu (AI sẽ đặt lại sau lượt trả lời); ai / user / fixed = giữ nguyên. */
    titleSource: text('title_source').$type<TitleSource>().notNull().default('fixed'),
    /** Nhóm trợ lý gợi ý, chờ người dùng đồng ý (null = không có / đã trả lời). */
    suggestedGroupId: text('suggested_group_id').references(() => conversationGroups.id, { onDelete: 'set null' }),
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
    reactions: text('reactions', { mode: 'json' }).$type<Reaction[]>().notNull().default([]),
    media: text('media', { mode: 'json' }).$type<MessageMedia>(),
    voice: text('voice', { mode: 'json' }).$type<MessageVoice>(),
    artifacts: text('artifacts', { mode: 'json' }).$type<MessageArtifact[]>().notNull().default([]),
    /** Trả lời một tin cụ thể (tin gốc có thể đã bị xoá khi sửa & gửi lại → hiện "tin gốc không còn"). */
    replyToId: text('reply_to_id'),
    /** Ghim tin trong cuộc trò chuyện (tối đa MAX_PINNED_MESSAGES). */
    pinnedAt: integer('pinned_at'),
    /** Thu hồi: nội dung đã xoá, chỉ còn dòng "đã thu hồi"; không gửi lại cho trợ lý. */
    recalledAt: integer('recalled_at'),
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

/** Lịch sử trao đổi với agent khác (Claude Code, Claude Desktop…) qua MCP server của app. */
export const agentExchanges = sqliteTable(
  'agent_exchanges',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull(),
    clientName: text('client_name').notNull(),
    tool: text('tool').notNull(),
    /** Yêu cầu của agent (đã cắt ngắn). */
    input: text('input').notNull().default(''),
    output: text('output'),
    status: text('status').$type<'queued' | 'running' | 'done' | 'error' | 'rejected'>().notNull(),
    error: text('error'),
    createdAt: integer('created_at').notNull().default(now),
    finishedAt: integer('finished_at')
  },
  (t) => [index('agent_exchanges_created_idx').on(t.createdAt), index('agent_exchanges_client_idx').on(t.clientId)]
)

/** Artifact (tài liệu, slide, bảng, biểu đồ, sơ đồ, HTML) theo hội thoại — chỉ lưu trên máy. */
export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    type: text('type').$type<ArtifactType>().notNull(),
    version: integer('version').notNull().default(1),
    updatedAt: integer('updated_at').notNull().default(now)
  },
  (t) => [index('artifacts_conversation_idx').on(t.conversationId, t.updatedAt)]
)

export const artifactVersions = sqliteTable(
  'artifact_versions',
  {
    id: text('id').primaryKey(),
    artifactId: text('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    by: text('by').$type<'assistant' | 'user'>().notNull(),
    createdAt: integer('created_at').notNull().default(now)
  },
  (t) => [index('artifact_versions_idx').on(t.artifactId, t.version)]
)
