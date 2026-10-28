import type { FeedbackSummaryRequest } from '@shared/schemas'
import type { FeedbackCategory, FeedbackKind, FeedbackReplyRow, FeedbackRow, FeedbackVisibility } from '@shared/supabase.types'

export type FeedbackTab = 'board' | 'received' | 'sent' | 'all'

/** Khớp các ràng buộc CHECK trong migration feedback. */
export function allowedVisibilities(kind: FeedbackKind, category: FeedbackCategory): FeedbackVisibility[] {
  if (kind === 'project') return ['public', 'anonymous', 'private']
  if (kind === 'person') return category === 'praise' ? ['private', 'public'] : ['private']
  return ['private']
}

export function filterTab(list: FeedbackRow[], tab: FeedbackTab, uid: string | undefined): FeedbackRow[] {
  switch (tab) {
    case 'board':
      return list.filter((f) => f.visibility === 'public' || f.visibility === 'anonymous')
    case 'received':
      return list.filter((f) => !!uid && f.recipient_id === uid)
    case 'sent':
      return list.filter((f) => f.is_mine)
    case 'all':
      return list
  }
}

export function canChangeStatus(f: FeedbackRow, uid: string | undefined, isManager: boolean): boolean {
  return isManager || (!!uid && f.recipient_id === uid)
}

export type SummaryScope = { type: 'team' } | { type: 'project'; id: string } | { type: 'person'; id: string }

/** "team" | "project:<id>" | "person:<id>" → phạm vi. */
export function parseScopeKey(key: string): SummaryScope {
  const [type, id] = key.split(':')
  if ((type === 'project' || type === 'person') && id) return { type, id }
  return { type: 'team' }
}

/** Số feedback trong từng phạm vi (để hiện cạnh lựa chọn và giải thích khi trống). */
export function countByScope(list: FeedbackRow[], keys: string[], since: string): Map<string, number> {
  return new Map(keys.map((k) => [k, summaryItems(list, [], parseScopeKey(k), since).length]))
}

/**
 * Feedback trong phạm vi + khoảng thời gian → dữ liệu gửi trợ lý tóm tắt.
 * KHÔNG kèm tên/ID người gửi hay người nhận.
 */
export function summaryItems(
  list: FeedbackRow[],
  replies: FeedbackReplyRow[],
  scope: SummaryScope,
  since: string
): FeedbackSummaryRequest['items'] {
  const inScope = list.filter((f) => {
    if (f.created_at.slice(0, 10) < since) return false
    if (scope.type === 'project') return f.project_id === scope.id
    if (scope.type === 'person') return f.recipient_id === scope.id
    return true
  })
  return inScope.slice(0, 200).map((f) => ({
    date: f.created_at.slice(0, 10),
    kind: f.kind,
    category: f.category,
    status: f.status,
    body: [f.title, f.body].filter(Boolean).join(' — '),
    replies: replies.filter((r) => r.feedback_id === f.id).map((r) => r.body).slice(0, 50)
  }))
}
