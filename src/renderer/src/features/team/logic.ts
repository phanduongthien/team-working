import type { TeamRole } from '@shared/schemas'

/**
 * Cách rời team, khớp với RPC leave_team:
 * - solo: mình là người cuối cùng → chọn giữ team (nhận mã khôi phục) hoặc xóa team
 * - successor: mình là Owner duy nhất nhưng team còn người → chọn người nhận quyền Owner
 * - simple: rời bình thường
 */
export type LeaveKind = 'solo' | 'successor' | 'simple'

export function leaveKind(members: { id: string; role: TeamRole }[], myId: string): LeaveKind {
  const others = members.filter((m) => m.id !== myId)
  if (others.length === 0) return 'solo'
  const me = members.find((m) => m.id === myId)
  if (me?.role === 'owner' && !others.some((m) => m.role === 'owner')) return 'successor'
  return 'simple'
}

/** Người nên được gợi ý nhận quyền Owner: Manager trước, rồi theo thứ tự danh sách. */
export function defaultSuccessor(members: { id: string; role: TeamRole }[], myId: string): string | null {
  const others = members.filter((m) => m.id !== myId)
  return (others.find((m) => m.role === 'manager') ?? others[0])?.id ?? null
}

/** Ký hiệu ngắn cho team (chữ cái đầu của tối đa 2 từ) để hiện trên thanh bên. */
export function teamInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join('')
    .toUpperCase()
}
