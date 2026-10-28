import type { TFunction } from 'i18next'
import type { DesktopNotification } from '@shared/schemas'
import type { NotificationRow } from '@shared/supabase.types'

/** Thông báo trong DB → tiêu đề/nội dung hiển thị + route mở đúng chỗ (hàm thuần, dễ test). */
export function describeNotification(
  n: Pick<NotificationRow, 'type' | 'payload'>,
  t: TFunction,
  nameOf: (userId: string | undefined) => string | undefined
): DesktopNotification {
  const p = n.payload
  // by = null với feedback ẩn danh → không bao giờ đoán tên.
  const by = (p.by ? nameOf(p.by) : undefined) ?? t('notifications:someone')
  const vars = {
    by,
    task: p.title ?? '',
    excerpt: p.excerpt ?? '',
    status: p.status ? t(`work:status.${p.status}`) : '',
    category: p.category ? t(`feedback:categories.${p.category}`) : ''
  }
  const route = p.feedback_id
    ? `/feedback?id=${p.feedback_id}`
    : p.project_id && p.task_id
      ? `/projects/${p.project_id}?task=${p.task_id}`
      : undefined
  return {
    title: t(`notifications:types.${n.type}.title`, vars),
    body: t(`notifications:types.${n.type}.body`, vars).slice(0, 300),
    route
  }
}

/** Nhắc mỗi task tối đa một lần mỗi ngày (khóa lưu trong localStorage). */
export function remindKeys(today: string, taskIds: string[], already: string[]): string[] {
  const done = new Set(already.filter((k) => k.startsWith(`${today}:`)))
  return taskIds.map((id) => `${today}:${id}`).filter((k) => !done.has(k))
}
