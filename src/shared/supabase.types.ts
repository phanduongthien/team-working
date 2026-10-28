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

export type NotificationType = 'task_assigned' | 'task_status' | 'task_comment'

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
    by?: string
  }
  read_at: string | null
  created_at: string
}

export type UserMemoryRow = { user_id: string; id: string; content: string; category: string; updated_at: string }

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
    }
    Views: Record<string, never>
    Functions: {
      create_team: { Args: { p_name: string }; Returns: TeamRow }
      accept_invite: { Args: { p_code: string }; Returns: string }
      my_invites: {
        Args: Record<string, never>
        Returns: { code: string; team_id: string; team_name: string; role: TeamRole; expires_at: string }[]
      }
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
