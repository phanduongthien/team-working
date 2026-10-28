import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FeedbackInsert, FeedbackStatus } from '@shared/supabase.types'
import { dbErrorCode, requireSupabase } from '@renderer/lib/supabase'

const check = <T>(res: { data: T; error: unknown }): NonNullable<T> => {
  if (res.error) throw new Error(dbErrorCode(res.error))
  return res.data as NonNullable<T>
}

const keys = {
  list: (teamId: string) => ['feedback', teamId] as const,
  replies: (feedbackId: string) => ['feedback-replies', feedbackId] as const,
  teamReplies: (teamId: string) => ['feedback-replies-team', teamId] as const
}

/** Mọi feedback tôi được xem trong team (view đã lọc quyền + che người gửi ẩn danh). */
export function useFeedbackList(teamId: string | null) {
  return useQuery({
    queryKey: keys.list(teamId ?? ''),
    enabled: !!teamId,
    queryFn: async () =>
      check(await requireSupabase().from('feedback_visible').select('*').eq('team_id', teamId!).order('created_at', { ascending: false }).limit(500))
  })
}

export function useReplies(feedbackId: string | null) {
  return useQuery({
    queryKey: keys.replies(feedbackId ?? ''),
    enabled: !!feedbackId,
    queryFn: async () =>
      check(await requireSupabase().from('feedback_replies_visible').select('*').eq('feedback_id', feedbackId!).order('created_at'))
  })
}

/** Toàn bộ trả lời tôi được xem trong team (dùng cho tóm tắt theo kỳ). */
export async function fetchTeamReplies(teamId: string) {
  return check(await requireSupabase().from('feedback_replies_visible').select('*').eq('team_id', teamId).limit(2000))
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['feedback'] })
    void qc.invalidateQueries({ queryKey: ['feedback-replies'] })
  }
}

export function useSendFeedback() {
  const invalidate = useInvalidate()
  return useMutation({
    // Không .select(): bảng gốc không cho đọc (che người gửi ẩn danh) — đọc lại qua view.
    mutationFn: async (input: FeedbackInsert) => check(await requireSupabase().from('feedback').insert(input)),
    onSuccess: invalidate
  })
}

export function useReply(feedbackId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (body: string) => check(await requireSupabase().from('feedback_replies').insert({ feedback_id: feedbackId, body })),
    onSuccess: invalidate
  })
}

export function useSetStatus() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FeedbackStatus }) =>
      check(await requireSupabase().rpc('set_feedback_status', { p_id: id, p_status: status })),
    onSuccess: invalidate
  })
}

export function useDeleteFeedback() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => check(await requireSupabase().rpc('delete_feedback', { p_id: id })),
    onSuccess: invalidate
  })
}

export function useDeleteReply() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => check(await requireSupabase().rpc('delete_feedback_reply', { p_id: id })),
    onSuccess: invalidate
  })
}
