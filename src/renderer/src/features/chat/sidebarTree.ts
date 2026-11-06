import type { Conversation, ConversationGroup } from '@shared/types'

/** Một dòng ở thanh bên: nhánh (fork) thụt vào dưới cuộc gốc nếu cùng mục. */
export type SidebarRow = { conversation: Conversation; depth: number }

export type SidebarSection =
  | { kind: 'pinned'; rows: SidebarRow[] }
  | { kind: 'group'; group: ConversationGroup; rows: SidebarRow[]; count: number; collapsed: boolean }
  | { kind: 'recent'; rows: SidebarRow[] }

/** Thụt tối đa 3 mức để tên không bị ép quá hẹp. */
export const MAX_DEPTH = 3

/**
 * Dựng thanh bên: Đã ghim (luôn ở đầu) → từng nhóm → chưa xếp nhóm.
 * `conversations` giữ thứ tự main trả về (ghim trước, mới nhất trước).
 * - Nhánh nằm ngay dưới cuộc gốc khi cả hai ở cùng mục; khác mục (vd nhánh được ghim) thì đứng riêng.
 * - Đang tìm kiếm: nhóm có kết quả tự mở (vẫn thu gọn được — `searchCollapsed`, chỉ trong lúc tìm,
 *   không ghi đè trạng thái đã lưu), nhóm không có kết quả bị ẩn; `count` = số kết quả khớp.
 */
export function buildSidebar(
  conversations: Conversation[],
  groups: ConversationGroup[],
  searching: boolean,
  searchCollapsed: Record<string, boolean> = {}
): SidebarSection[] {
  const groupIds = new Set(groups.map((g) => g.id))
  const sectionOf = (c: Conversation): string =>
    c.pinned ? 'pinned' : c.groupId && groupIds.has(c.groupId) ? `group:${c.groupId}` : 'recent'

  const buckets = new Map<string, Conversation[]>()
  for (const c of conversations) {
    const key = sectionOf(c)
    buckets.set(key, [...(buckets.get(key) ?? []), c])
  }

  const rowsOf = (list: Conversation[]): SidebarRow[] => {
    const ids = new Set(list.map((c) => c.id))
    const children = new Map<string, Conversation[]>()
    const roots: Conversation[] = []
    for (const c of list) {
      if (c.parentId && c.parentId !== c.id && ids.has(c.parentId))
        children.set(c.parentId, [...(children.get(c.parentId) ?? []), c])
      else roots.push(c)
    }
    const rows: SidebarRow[] = []
    const seen = new Set<string>()
    const visit = (c: Conversation, depth: number): void => {
      if (seen.has(c.id)) return // chống vòng lặp dữ liệu hỏng
      seen.add(c.id)
      rows.push({ conversation: c, depth: Math.min(depth, MAX_DEPTH) })
      for (const child of children.get(c.id) ?? []) visit(child, depth + 1)
    }
    for (const r of roots) visit(r, 0)
    // Dữ liệu vòng (a là con b, b là con a): không có gốc → vẫn hiện.
    for (const c of list) if (!seen.has(c.id)) visit(c, 0)
    return rows
  }

  const sections: SidebarSection[] = []
  const pinned = buckets.get('pinned') ?? []
  if (pinned.length) sections.push({ kind: 'pinned', rows: rowsOf(pinned) })
  for (const group of groups) {
    const list = buckets.get(`group:${group.id}`) ?? []
    if (searching && list.length === 0) continue
    const collapsed = searching ? (searchCollapsed[group.id] ?? false) : group.collapsed
    sections.push({ kind: 'group', group, rows: collapsed ? [] : rowsOf(list), count: list.length, collapsed })
  }
  const recent = buckets.get('recent') ?? []
  if (recent.length) sections.push({ kind: 'recent', rows: rowsOf(recent) })
  return sections
}

/** Kiểu dữ liệu kéo thả cuộc trò chuyện trong thanh bên. */
export const DRAG_TYPE = 'application/x-mmc-conversation'

