import { useMemo } from 'react'
import { useTeam, type Member } from '@renderer/stores/team'

/** id → thành viên của team đang chọn. */
export function useMemberMap(): Map<string, Member> {
  const members = useTeam((s) => s.members)
  return useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
}

export function formatDate(iso: string | null, lang: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric' })
}
