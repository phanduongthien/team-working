import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PlannedStep, QuizQuestion } from '@shared/schemas'
import type { Database } from '@shared/supabase.types'
import { dbErrorCode, requireSupabase } from '@renderer/lib/supabase'

type StepUpdate = Database['public']['Tables']['learning_steps']['Update']

const check = <T>(res: { data: T; error: unknown }): NonNullable<T> => {
  if (res.error) throw new Error(dbErrorCode(res.error))
  return res.data as NonNullable<T>
}

export function useMyPaths(uid: string | undefined) {
  return useQuery({
    queryKey: ['learning-paths', 'mine', uid ?? ''],
    enabled: !!uid,
    queryFn: async () => check(await requireSupabase().from('learning_paths').select('*').eq('owner_id', uid!).order('created_at', { ascending: false }))
  })
}

/** Lộ trình thành viên CHIA SẺ trong team (RLS chỉ trả về khi tôi là Manager/Owner). */
export function useSharedPaths(teamId: string | null, uid: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['learning-paths', 'team', teamId ?? ''],
    enabled: enabled && !!teamId && !!uid,
    queryFn: async () =>
      check(await requireSupabase().from('learning_paths').select('*').eq('team_id', teamId!).eq('shared', true).neq('owner_id', uid!).order('updated_at', { ascending: false }))
  })
}

/** Bước của nhiều lộ trình (để tính tiến độ trên danh sách). */
export function useSteps(pathIds: string[]) {
  return useQuery({
    queryKey: ['learning-steps', ...pathIds],
    enabled: pathIds.length > 0,
    queryFn: async () => check(await requireSupabase().from('learning_steps').select('*').in('path_id', pathIds).order('position'))
  })
}

export function useQuizAttempts(pathId: string | null) {
  return useQuery({
    queryKey: ['quiz-attempts', pathId ?? ''],
    enabled: !!pathId,
    queryFn: async () => check(await requireSupabase().from('quiz_attempts').select('*').eq('path_id', pathId!).order('created_at', { ascending: false }).limit(20))
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    for (const key of ['learning-paths', 'learning-steps', 'quiz-attempts']) void qc.invalidateQueries({ queryKey: [key] })
  }
}

export function useCreatePath() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (input: { title: string; goal: string; level: string; teamId: string | null; shared: boolean; steps: PlannedStep[] }) => {
      const db = requireSupabase()
      const path = check(
        await db.from('learning_paths').insert({ title: input.title, goal: input.goal, level: input.level, team_id: input.teamId, shared: input.shared }).select('*').single()
      )
      if (input.steps.length) {
        check(
          await db.from('learning_steps').insert(
            input.steps.map((s, i) => ({
              path_id: path.id,
              title: s.title,
              description: s.description,
              resources: s.resources,
              estimated_hours: s.estimatedHours,
              due_date: s.dueDate,
              position: (i + 1) * 1000
            }))
          )
        )
      }
      return path
    },
    onSuccess: invalidate
  })
}

export function useUpdatePath() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { shared?: boolean; title?: string } }) =>
      check(await requireSupabase().from('learning_paths').update(patch).eq('id', id)),
    onSuccess: invalidate
  })
}

export function useDeletePath() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => check(await requireSupabase().from('learning_paths').delete().eq('id', id)),
    onSuccess: invalidate
  })
}

export function useUpdateStep() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: StepUpdate }) => check(await requireSupabase().from('learning_steps').update(patch).eq('id', id)),
    onSuccess: invalidate
  })
}

export function useAddStep() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ pathId, title, position }: { pathId: string; title: string; position: number }) =>
      check(await requireSupabase().from('learning_steps').insert({ path_id: pathId, title, position })),
    onSuccess: invalidate
  })
}

export function useDeleteStep() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => check(await requireSupabase().from('learning_steps').delete().eq('id', id)),
    onSuccess: invalidate
  })
}

export function useSaveAttempt() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (input: {
      pathId: string | null
      stepId: string | null
      topic: string
      questions: QuizQuestion[]
      answers: string[]
      score: number
      weakPoints: string[]
    }) =>
      check(
        await requireSupabase().from('quiz_attempts').insert({
          path_id: input.pathId,
          step_id: input.stepId,
          topic: input.topic.slice(0, 300),
          questions: input.questions,
          answers: input.answers,
          score: input.score,
          total: input.questions.length,
          weak_points: input.weakPoints
        })
      ),
    onSuccess: invalidate
  })
}
