import { create } from 'zustand'
import type { TeamRole } from '@shared/schemas'
import type { ProfileRow, TeamInviteRow, TeamRow } from '@shared/supabase.types'
import { dbErrorCode, requireSupabase, supabase } from '@renderer/lib/supabase'
import { useAuth } from './auth'

export type MyTeam = TeamRow & { role: TeamRole }
export type Member = ProfileRow & { role: TeamRole; joined_at: string }
export type PendingInvite = { code: string; team_id: string; team_name: string; role: TeamRole; expires_at: string }
/** Mã để vào lại team mà mình là người cuối cùng rời đi (team được giữ lại). */
export type RecoveryCode = { teamName: string; code: string }
export type LeaveOptions = { deleteTeam?: boolean; successorId?: string }

const CURRENT_KEY = 'tw.currentTeam'

function readCurrent(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

type TeamState = {
  teams: MyTeam[]
  currentTeamId: string | null
  members: Member[]
  pendingInvites: PendingInvite[]
  recoveryCode: RecoveryCode | null
  loaded: boolean

  load(): Promise<void>
  select(teamId: string): Promise<void>
  loadMembers(): Promise<void>
  createTeam(name: string): Promise<void>
  acceptInvite(code: string): Promise<void>
  renameTeam(name: string): Promise<void>
  changeRole(userId: string, role: TeamRole): Promise<void>
  transferOwnership(userId: string): Promise<void>
  removeMember(userId: string): Promise<void>
  leaveTeam(opts?: LeaveOptions): Promise<void>
  dismissRecoveryCode(): void
  listInvites(): Promise<TeamInviteRow[]>
  createInvite(input: { email: string | null; role: TeamRole }): Promise<TeamInviteRow>
  deleteInvite(id: string): Promise<void>
  reset(): void
}

/** Lỗi → throw mã ngắn; còn lại trả data (lệnh update/delete không select thì data không dùng tới). */
const check = <T>(res: { data: T; error: unknown }): NonNullable<T> => {
  if (res.error) throw new Error(dbErrorCode(res.error))
  return res.data as NonNullable<T>
}

export const useTeam = create<TeamState>((set, get) => ({
  teams: [],
  currentTeamId: readCurrent(),
  members: [],
  pendingInvites: [],
  recoveryCode: null,
  loaded: false,

  async load() {
    const uid = useAuth.getState().session?.user.id
    if (!supabase || !uid) return
    const [memberships, invites] = await Promise.all([
      supabase.from('team_members').select('team_id, role').eq('user_id', uid),
      supabase.rpc('my_invites')
    ])
    const roles = check(memberships)
    const teams = roles.length
      ? check(await supabase.from('teams').select('*').in('id', roles.map((r) => r.team_id)).order('created_at'))
      : []
    const myTeams = teams.map((t) => ({ ...t, role: roles.find((r) => r.team_id === t.id)!.role }))
    const current = myTeams.find((t) => t.id === get().currentTeamId)?.id ?? myTeams[0]?.id ?? null
    set({ teams: myTeams, pendingInvites: invites.data ?? [], loaded: true })
    if (current !== get().currentTeamId || get().members.length === 0) await get().select(current ?? '')
  },

  async select(teamId) {
    const id = teamId || null
    try {
      if (id) localStorage.setItem(CURRENT_KEY, id)
      else localStorage.removeItem(CURRENT_KEY)
    } catch {
      // bỏ qua nếu không ghi được
    }
    set({ currentTeamId: id, members: [] })
    if (id) await get().loadMembers()
  },

  async loadMembers() {
    const teamId = get().currentTeamId
    if (!teamId) return
    const db = requireSupabase()
    const rows = check(await db.from('team_members').select('user_id, role, joined_at').eq('team_id', teamId))
    const profiles = rows.length ? check(await db.from('profiles').select('*').in('id', rows.map((r) => r.user_id))) : []
    const members = profiles
      .map((p) => {
        const m = rows.find((r) => r.user_id === p.id)!
        return { ...p, role: m.role, joined_at: m.joined_at }
      })
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.display_name.localeCompare(b.display_name))
    if (get().currentTeamId === teamId) set({ members })
  },

  async createTeam(name) {
    const team = check(await requireSupabase().rpc('create_team', { p_name: name }))
    await get().load()
    await get().select(team.id)
  },

  async acceptInvite(code) {
    const teamId = check(await requireSupabase().rpc('accept_invite', { p_code: code.trim() }))
    await get().load()
    await get().select(teamId)
  },

  async renameTeam(name) {
    const id = get().currentTeamId
    if (!id) return
    check(await requireSupabase().from('teams').update({ name }).eq('id', id))
    await get().load()
  },

  async changeRole(userId, role) {
    const id = get().currentTeamId
    if (!id) return
    check(await requireSupabase().from('team_members').update({ role }).eq('team_id', id).eq('user_id', userId))
    await get().loadMembers()
  },

  /** Nhường Owner (nguyên tử): người nhận lên Owner, mình xuống Manager. */
  async transferOwnership(userId) {
    const id = get().currentTeamId
    if (!id) return
    const res = await requireSupabase().rpc('transfer_ownership', { p_team: id, p_new_owner: userId })
    if (res.error) throw new Error(dbErrorCode(res.error))
    await get().load()
    await get().loadMembers()
  },

  async removeMember(userId) {
    const id = get().currentTeamId
    if (!id) return
    check(await requireSupabase().from('team_members').delete().eq('team_id', id).eq('user_id', userId))
    await get().loadMembers()
  },

  async leaveTeam(opts = {}) {
    const id = get().currentTeamId
    if (!id) return
    const teamName = get().teams.find((t) => t.id === id)?.name ?? ''
    const res = await requireSupabase().rpc('leave_team', {
      p_team: id,
      p_delete_team: opts.deleteTeam ?? false,
      p_successor: opts.successorId ?? null
    })
    if (res.error) throw new Error(dbErrorCode(res.error))
    if (res.data) set({ recoveryCode: { teamName, code: res.data } })
    // Chuyển sang team khác của mình (hoặc màn hình tạo/tham gia nếu không còn team nào).
    await get().select('')
    await get().load()
  },

  dismissRecoveryCode() {
    set({ recoveryCode: null })
  },

  async listInvites() {
    const id = get().currentTeamId
    if (!id) return []
    return check(
      await requireSupabase()
        .from('team_invites')
        .select('*')
        .eq('team_id', id)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
    )
  },

  async createInvite({ email, role }) {
    const id = get().currentTeamId
    if (!id) throw new Error('no_team')
    return check(await requireSupabase().from('team_invites').insert({ team_id: id, email, role }).select('*').single())
  },

  async deleteInvite(inviteId) {
    check(await requireSupabase().from('team_invites').delete().eq('id', inviteId))
  },

  reset() {
    set({ teams: [], members: [], pendingInvites: [], recoveryCode: null, loaded: false })
  }
}))

const ROLE_ORDER: Record<TeamRole, number> = { owner: 0, manager: 1, member: 2 }

/** Vai trò của tôi trong team đang chọn. */
export function useMyRole(): TeamRole | null {
  return useTeam((s) => s.teams.find((t) => t.id === s.currentTeamId)?.role ?? null)
}

export const isManagerRole = (role: TeamRole | null): boolean => role === 'owner' || role === 'manager'
