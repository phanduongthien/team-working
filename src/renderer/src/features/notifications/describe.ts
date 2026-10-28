import type { TFunction } from 'i18next'
import type { DesktopNotification } from '@shared/schemas'
import type { NotificationRow } from '@shared/supabase.types'

/** Thông báo trong DB → tiêu đề/nội dung hiển thị + route mở task (hàm thuần, dễ test). */
export function describeNotification(
  n: Pick<NotificationRow, 'type' | 'payload'>,
  t: TFunction,
  nameOf: (userId: string | undefined) => string | undefined
): DesktopNotification {
  const p = n.payload
  const by = nameOf(p.by) ?? t('notifications:someone')
  const vars = {
    by,
    task: p.title ?? '',
    excerpt: p.excerpt ?? '',
    status: p.status ? t(`work:status.${p.status}`) : ''
  }
  return {
    title: t(`notifications:types.${n.type}.title`, vars),
    body: t(`notifications:types.${n.type}.body`, vars).slice(0, 300),
    route: p.project_id && p.task_id ? `/projects/${p.project_id}?task=${p.task_id}` : undefined
  }
}

/** Nhắc mỗi task tối đa một lần mỗi ngày (khóa lưu trong localStorage). */
export function remindKeys(today: string, taskIds: string[], already: string[]): string[] {
  const done = new Set(already.filter((k) => k.startsWith(`${today}:`)))
  return taskIds.map((id) => `${today}:${id}`).filter((k) => !done.has(k))
}
