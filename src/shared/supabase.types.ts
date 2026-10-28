/**
 * Kiểu dữ liệu schema Supabase (khớp supabase/migrations). Khi đã link CLI có thể sinh lại:
 *   npx supabase gen types typescript --linked > src/shared/supabase.types.ts
 */
import type { ProjectStatus, TaskPriority, TaskStatus, TeamRole } from './schemas'

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type ProfileRow = {
  id: string
  display_name: string
  avatar_url: string | null
  github_username: string | null
  email: string | null
  skills: string[]
  created_at: string
  updated_at: string
}

export type TeamRow = { id: string; name: string; created_by: string; created_at: string }

export type TeamMemberRow = { team_id: string; user_id: string; role: TeamRole; joined_at: string }

export type TeamInviteRow = {
  id: string
  team_id: string
  email: string | null
  code: string
  role: TeamRole
  created_by: string
  created_at: string
  expires_at: string
  accepted_by: string | null
  accepted_at: string | null
}

export type ProjectRow = {
  id: string
  team_id: string
  name: string
  description: string
  goal: string
  status: ProjectStatus
  start_date: string | null
  due_date: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type TaskRow = {
  id: string
  team_id: string
  project_id: string
  parent_id: string | null
  title: string
  description: string
  assignee_id: string | null
  assigner_id: string
  priority: TaskPriority
  status: TaskStatus
  due_date: string | null
  estimate_hours: number | null
  position: number
  ai_generated: boolean
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type TaskStatusEventRow = {
  id: number
  task_id: string
  team_id: string
  project_id: string
  from_status: TaskStatus | null
  to_status: TaskStatus
  changed_by: string | null
  at: string
}

export type TaskCommentRow = {
  id: string
  task_id: string
  team_id: string
  author_id: string
  body: string
  created_at: string
  updated_at: string
}

export type TaskAttachmentRow = {
  id: string
  task_id: string
  team_id: string
  storage_path: string
  name: string
  size: number
  mime_type: string
  uploaded_by: string
  created_at: string
}

export type NotificationType =
  | 'task_assigned'
  | 'task_status'
  | 'task_comment'
  | 'feedback_received'
  | 'feedback_project'
  | 'feedback_reply'
  | 'progress_report'

export type NotificationRow = {
  id: string
  user_id: string
  team_id: string | null
  type: NotificationType
  payload: {
    task_id?: string
    project_id?: string
    title?: string
    status?: TaskStatus
    excerpt?: string
    due_date?: string | null
    by?: string | null
    feedback_id?: string
    report_id?: string
    category?: string
    kind?: string
    visibility?: string
  }
  read_at: string | null
  created_at: string
}

export type UserMemoryRow = { user_id: string; id: string; content: string; category: string; updated_at: string }

export type UserSettingsRow = {
  user_id: string
  assistant: unknown | null
  updated_at: string
  profile: unknown | null
  profile_updated_at: string | null
}

export type LearningPathRow = {
  id: string
  owner_id: string
  team_id: string | null
  title: string
  goal: string
  level: string
  shared: boolean
  created_at: string
  updated_at: string
}

export type LearningStepRow = {
  id: string
  path_id: string
  owner_id: string
  title: string
  description: string
  resources: string[]
  estimated_hours: number | null
  due_date: string | null
  status: 'todo' | 'doing' | 'done'
  notes: string
  position: number
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type QuizAttemptRow = {
  id: string
  owner_id: string
  path_id: string | null
  step_id: string | null
  topic: string
  questions: unknown
  answers: unknown
  score: number
  total: number
  weak_points: string[]
  created_at: string
}

export type ProgressReportRow = {
  id: string
  team_id: string
  author_id: string
  period_type: 'day' | 'week'
  period_label: string
  body: string
  created_at: string
}

export type FeedbackKind = 'project' | 'person' | 'review'
export type FeedbackVisibility = 'public' | 'anonymous' | 'private'
export type FeedbackCategory = 'praise' | 'improve' | 'suggestion'
export type FeedbackStatus = 'open' | 'acknowledged' | 'resolved'

/** Hàng đọc qua view feedback_visible (author_id = null nếu ẩn danh với người xem). */
export type FeedbackRow = {
  id: string
  team_id: string
  kind: FeedbackKind
  visibility: FeedbackVisibility
  category: FeedbackCategory
  project_id: string | null
  task_id: string | null
  recipient_id: string | null
  author_id: string | null
  is_mine: boolean
  title: string
  body: string
  period: string | null
  status: FeedbackStatus
  created_at: string
  updated_at: string
  reply_count: number
}

export type FeedbackInsert = {
  team_id: string
  kind: FeedbackKind
  visibility: FeedbackVisibility
  category: FeedbackCategory
  project_id?: string | null
  task_id?: string | null
  recipient_id?: string | null
  title?: string
  body: string
  period?: string | null
}

export type FeedbackReplyRow = {
  id: string
  feedback_id: string
  team_id: string
  author_id: string | null
  by_feedback_author: boolean
  is_mine: boolean
  body: string
  created_at: string
}

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Optional<ProfileRow, 'display_name' | 'avatar_url' | 'github_username' | 'email' | 'skills' | 'created_at' | 'updated_at'>>
      teams: Table<TeamRow, Optional<TeamRow, 'id' | 'created_at'>>
      team_members: Table<TeamMemberRow, Optional<TeamMemberRow, 'role' | 'joined_at'>>
      team_invites: Table<
        TeamInviteRow,
        Optional<TeamInviteRow, 'id' | 'email' | 'code' | 'role' | 'created_by' | 'created_at' | 'expires_at' | 'accepted_by' | 'accepted_at'>
      >
      projects: Table<
        ProjectRow,
        Optional<ProjectRow, 'id' | 'description' | 'goal' | 'status' | 'start_date' | 'due_date' | 'created_by' | 'created_at' | 'updated_at'>
      >
      tasks: Table<
        TaskRow,
        Optional<
          TaskRow,
          | 'id'
          | 'team_id'
          | 'parent_id'
          | 'description'
          | 'assignee_id'
          | 'assigner_id'
          | 'priority'
          | 'status'
          | 'due_date'
          | 'estimate_hours'
          | 'position'
          | 'ai_generated'
          | 'completed_at'
          | 'created_at'
          | 'updated_at'
        >
      >
      task_status_events: Table<TaskStatusEventRow, never, never>
      task_comments: Table<TaskCommentRow, Optional<TaskCommentRow, 'id' | 'team_id' | 'author_id' | 'created_at' | 'updated_at'>>
      task_attachments: Table<TaskAttachmentRow, Optional<TaskAttachmentRow, 'id' | 'team_id' | 'uploaded_by' | 'created_at'>>
      notifications: Table<NotificationRow, never, Pick<NotificationRow, 'read_at'>>
      user_memories: Table<UserMemoryRow, Optional<UserMemoryRow, 'user_id' | 'updated_at'>>
      user_settings: Table<UserSettingsRow, Optional<UserSettingsRow, 'user_id' | 'updated_at' | 'assistant' | 'profile' | 'profile_updated_at'>>
      learning_paths: Table<LearningPathRow, Optional<LearningPathRow, 'id' | 'owner_id' | 'team_id' | 'goal' | 'level' | 'shared' | 'created_at' | 'updated_at'>>
      learning_steps: Table<
        LearningStepRow,
        Optional<LearningStepRow, 'id' | 'owner_id' | 'description' | 'resources' | 'estimated_hours' | 'due_date' | 'status' | 'notes' | 'position' | 'completed_at' | 'created_at' | 'updated_at'>
      >
      quiz_attempts: Table<QuizAttemptRow, Optional<QuizAttemptRow, 'id' | 'owner_id' | 'path_id' | 'step_id' | 'answers' | 'score' | 'weak_points' | 'created_at'>, never>
      progress_reports: Table<ProgressReportRow, Optional<ProgressReportRow, 'id' | 'author_id' | 'created_at'>, never>
      // Bảng gốc chỉ INSERT; đọc qua view.
      feedback: Table<never, FeedbackInsert, never>
      feedback_replies: Table<never, { feedback_id: string; body: string }, never>
    }
    Views: {
      feedback_visible: { Row: FeedbackRow; Relationships: [] }
      feedback_replies_visible: { Row: FeedbackReplyRow; Relationships: [] }
    }
    Functions: {
      create_team: { Args: { p_name: string }; Returns: TeamRow }
      accept_invite: { Args: { p_code: string }; Returns: string }
      my_invites: {
        Args: Record<string, never>
        Returns: { code: string; team_id: string; team_name: string; role: TeamRole; expires_at: string }[]
      }
      set_feedback_status: { Args: { p_id: string; p_status: FeedbackStatus }; Returns: undefined }
      delete_feedback: { Args: { p_id: string }; Returns: undefined }
      delete_feedback_reply: { Args: { p_id: string }; Returns: undefined }
    }
    Enums: {
      team_role: TeamRole
      project_status: ProjectStatus
      task_status: TaskStatus
      task_priority: TaskPriority
    }
    CompositeTypes: Record<string, never>
  }
}
