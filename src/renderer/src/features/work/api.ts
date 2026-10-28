import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Database, ProjectRow, TaskRow } from '@shared/supabase.types'
import { dbErrorCode, requireSupabase, supabase } from '@renderer/lib/supabase'

type Tables = Database['public']['Tables']
export type ProjectInsert = Tables['projects']['Insert']
export type TaskInsert = Tables['tasks']['Insert']
export type TaskUpdate = Tables['tasks']['Update']

export const MAX_TASK_FILE_BYTES = 10 * 1024 * 1024

/** Lỗi → throw mã ngắn; còn lại trả data (lệnh update/delete không select thì data không dùng tới). */
const check = <T>(res: { data: T; error: unknown }): NonNullable<T> => {
  if (res.error) throw new Error(dbErrorCode(res.error))
  return res.data as NonNullable<T>
}

export const keys = {
  projects: (teamId: string) => ['projects', teamId] as const,
  tasks: (projectId: string) => ['tasks', projectId] as const,
  teamTasks: (teamId: string) => ['team-tasks', teamId] as const,
  comments: (taskId: string) => ['comments', taskId] as const,
  attachments: (taskId: string) => ['attachments', taskId] as const,
  events: (projectId: string) => ['status-events', projectId] as const
}

// ---------------- Queries ----------------

export function useProjects(teamId: string | null) {
  return useQuery({
    queryKey: keys.projects(teamId ?? ''),
    enabled: !!teamId,
    queryFn: async () =>
      check(await requireSupabase().from('projects').select('*').eq('team_id', teamId!).order('created_at', { ascending: false }))
  })
}

export function useTasks(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.tasks(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async () => check(await requireSupabase().from('tasks').select('*').eq('project_id', projectId!).order('position'))
  })
}

export function useTeamTasks(teamId: string | null) {
  return useQuery({
    queryKey: keys.teamTasks(teamId ?? ''),
    enabled: !!teamId,
    queryFn: async () => check(await requireSupabase().from('tasks').select('*').eq('team_id', teamId!))
  })
}

/** Task chưa xong được giao cho tôi trong team đang chọn (cho bấm giờ, kế hoạch ngày). */
export function useMyOpenTasks(teamId: string | null, uid: string | undefined) {
  return useQuery({
    queryKey: ['my-tasks', teamId ?? '', uid ?? ''],
    enabled: !!teamId && !!uid && !!supabase,
    queryFn: async () =>
      check(
        await requireSupabase()
          .from('tasks')
          .select('*')
          .eq('team_id', teamId!)
          .eq('assignee_id', uid!)
          .neq('status', 'done')
          .order('due_date', { ascending: true, nullsFirst: false })
      )
  })
}

export function useStatusEvents(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.events(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async () =>
      check(await requireSupabase().from('task_status_events').select('*').eq('project_id', projectId!).order('at').limit(10_000))
  })
}

export function useComments(taskId: string) {
  return useQuery({
    queryKey: keys.comments(taskId),
    queryFn: async () => check(await requireSupabase().from('task_comments').select('*').eq('task_id', taskId).order('created_at'))
  })
}

export function useAttachments(taskId: string) {
  return useQuery({
    queryKey: keys.attachments(taskId),
    queryFn: async () => check(await requireSupabase().from('task_attachments').select('*').eq('task_id', taskId).order('created_at'))
  })
}

// ---------------- Mutations ----------------

/** Làm mới mọi dữ liệu task liên quan sau khi ghi. */
function useInvalidateWork() {
  const qc = useQueryClient()
  return (projectId?: string) => {
    if (projectId) void qc.invalidateQueries({ queryKey: keys.tasks(projectId) })
    void qc.invalidateQueries({ queryKey: ['team-tasks'] })
    void qc.invalidateQueries({ queryKey: ['projects'] })
    if (projectId) void qc.invalidateQueries({ queryKey: keys.events(projectId) })
  }
}

export function useSaveProject() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: async (input: ProjectInsert & { id?: string }): Promise<ProjectRow> => {
      const db = requireSupabase()
      const { id, ...fields } = input
      return id
        ? check(await db.from('projects').update(fields).eq('id', id).select('*').single())
        : check(await db.from('projects').insert(fields).select('*').single())
    },
    onSuccess: (p) => invalidate(p.id)
  })
}

export function useDeleteProject() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: async (id: string) => check(await requireSupabase().from('projects').delete().eq('id', id)),
    onSuccess: () => invalidate()
  })
}

export function useCreateTasks() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: async (rows: TaskInsert[]): Promise<TaskRow[]> =>
      check(await requireSupabase().from('tasks').insert(rows).select('*')),
    onSuccess: (rows) => invalidate(rows[0]?.project_id)
  })
}

/** Cập nhật task với optimistic update (kéo thả Kanban phản hồi ngay). */
export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskUpdate }) =>
      check(await requireSupabase().from('tasks').update(patch).eq('id', id).select('*').single()),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: keys.tasks(projectId) })
      const previous = qc.getQueryData<TaskRow[]>(keys.tasks(projectId))
      qc.setQueryData<TaskRow[]>(keys.tasks(projectId), (list) =>
        list?.map((t) => (t.id === id ? ({ ...t, ...patch } as TaskRow) : t))
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.tasks(projectId), ctx.previous)
    },
    onSettled: () => invalidate(projectId)
  })
}

export function useDeleteTask(projectId: string) {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: async (id: string) => check(await requireSupabase().from('tasks').delete().eq('id', id)),
    onSuccess: () => invalidate(projectId)
  })
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => check(await requireSupabase().from('task_comments').insert({ task_id: taskId, body }).select('*').single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.comments(taskId) })
  })
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => check(await requireSupabase().from('task_comments').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.comments(taskId) })
  })
}

/** Tên file an toàn cho đường dẫn Storage (giữ đuôi, bỏ ký tự lạ). */
export function storageSafeName(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
  return cleaned.slice(-100) || 'file'
}

export function useUploadAttachment(task: Pick<TaskRow, 'id' | 'team_id'>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_TASK_FILE_BYTES) throw new Error('file_too_large')
      const db = requireSupabase()
      const path = `${task.team_id}/${task.id}/${crypto.randomUUID()}-${storageSafeName(file.name)}`
      const uploaded = await db.storage.from('task-files').upload(path, file, { contentType: file.type || undefined })
      if (uploaded.error) throw new Error(dbErrorCode(uploaded.error))
      const row = await db
        .from('task_attachments')
        .insert({ task_id: task.id, storage_path: path, name: file.name.slice(0, 255), size: file.size, mime_type: file.type || 'application/octet-stream' })
        .select('*')
        .single()
      if (row.error) {
        await db.storage.from('task-files').remove([path])
        throw new Error(dbErrorCode(row.error))
      }
      return row.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.attachments(task.id) })
  })
}

export function useDeleteAttachment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, path }: { id: string; path: string }) => {
      const db = requireSupabase()
      check(await db.from('task_attachments').delete().eq('id', id))
      await db.storage.from('task-files').remove([path])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.attachments(taskId) })
  })
}

/** Link tải tạm (5 phút) cho file riêng tư. */
export async function signedUrl(path: string): Promise<string> {
  const res = await requireSupabase().storage.from('task-files').createSignedUrl(path, 300)
  if (res.error) throw new Error(dbErrorCode(res.error))
  return res.data.signedUrl
}

/** Nghe thay đổi task/bình luận của team qua Realtime → làm mới dữ liệu. */
export function useTeamRealtime(teamId: string | null) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!supabase || !teamId) return
    const channel = supabase
      .channel(`team-${teamId}`)
      // Sự kiện DELETE chỉ mang khóa chính → làm mới theo prefix thay vì theo từng dự án.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `team_id=eq.${teamId}` }, () => {
        for (const key of ['tasks', 'team-tasks', 'status-events']) void qc.invalidateQueries({ queryKey: [key] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments', filter: `team_id=eq.${teamId}` }, () => {
        void qc.invalidateQueries({ queryKey: ['comments'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `team_id=eq.${teamId}` }, () => {
        void qc.invalidateQueries({ queryKey: ['projects'] })
      })
      .subscribe()
    return () => {
      void supabase?.removeChannel(channel)
    }
  }, [teamId, qc])
}
