import type { RealtimeChannel } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { NotificationRow, TaskRow } from '@shared/supabase.types'
import i18n from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { supabase } from '@renderer/lib/supabase'
import { useAuth } from '@renderer/stores/auth'
import { useTeam } from '@renderer/stores/team'
import { addDays, dueSoon, localDate } from '../work/logic'
import { describeNotification, remindKeys } from './describe'

const REMINDED_KEY = 'tw.reminded'
const REMIND_EVERY_MS = 60 * 60 * 1000

type NotificationState = {
  items: NotificationRow[]
  unread: number
  load(): Promise<void>
  markRead(id: string): Promise<void>
  markAllRead(): Promise<void>
  push(row: NotificationRow): void
  clear(): void
}

const unreadOf = (items: NotificationRow[]): number => items.filter((n) => !n.read_at).length

export const useNotifications = create<NotificationState>((set, get) => ({
  items: [],
  unread: 0,

  async load() {
    const uid = useAuth.getState().session?.user.id
    if (!supabase || !uid) return
    const { data } = await supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(100)
    set({ items: data ?? [], unread: unreadOf(data ?? []) })
  },

  async markRead(id) {
    const now = new Date().toISOString()
    set((s) => {
      const items = s.items.map((n) => (n.id === id ? { ...n, read_at: now } : n))
      return { items, unread: unreadOf(items) }
    })
    await supabase?.from('notifications').update({ read_at: now }).eq('id', id)
  },

  async markAllRead() {
    const uid = useAuth.getState().session?.user.id
    const now = new Date().toISOString()
    set((s) => ({ items: s.items.map((n) => ({ ...n, read_at: n.read_at ?? now })), unread: 0 }))
    if (uid) await supabase?.from('notifications').update({ read_at: now }).eq('user_id', uid).is('read_at', null)
  },

  push(row) {
    if (get().items.some((n) => n.id === row.id)) return
    const items = [row, ...get().items]
    set({ items, unread: unreadOf(items) })
  },

  clear() {
    set({ items: [], unread: 0 })
  }
}))

const nameOf = (id: string | undefined): string | undefined =>
  id ? useTeam.getState().members.find((m) => m.id === id)?.display_name : undefined

/** Nhắc task của tôi đến hạn hôm nay/ngày mai — mỗi task một lần mỗi ngày. */
async function remindDueSoon(uid: string): Promise<void> {
  if (!supabase) return
  const today = localDate(new Date())
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('assignee_id', uid)
    .neq('status', 'done')
    .lte('due_date', addDays(today, 1))
    .gte('due_date', today)
  const tasks = dueSoon((data ?? []) as TaskRow[], uid, today)
  let already: string[] = []
  try {
    already = JSON.parse(localStorage.getItem(REMINDED_KEY) ?? '[]') as string[]
  } catch {
    already = []
  }
  const fresh = remindKeys(today, tasks.map((t) => t.id), already)
  for (const key of fresh) {
    const task = tasks.find((t) => key.endsWith(t.id))!
    const date = task.due_date === today ? i18n.t('work:calendar.today').toLowerCase() : task.due_date
    void api.notify.show({
      title: i18n.t('notifications:types.due_soon.title'),
      body: i18n.t('notifications:types.due_soon.body', { task: task.title, date }),
      route: `/projects/${task.project_id}?task=${task.id}`
    })
  }
  try {
    localStorage.setItem(REMINDED_KEY, JSON.stringify([...already.filter((k) => k.startsWith(today)), ...fresh]))
  } catch {
    // bỏ qua
  }
}

/**
 * Khi đăng nhập: tải thông báo, nghe thông báo mới qua Realtime (hiện toast Windows),
 * nhắc việc sắp đến hạn mỗi giờ. Đăng xuất thì dọn sạch.
 */
export function setupNotifications(): () => void {
  let channel: RealtimeChannel | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let currentUid: string | null = null

  const stop = (): void => {
    if (channel) void supabase?.removeChannel(channel)
    if (timer) clearInterval(timer)
    channel = null
    timer = null
  }

  const start = (uid: string): void => {
    stop()
    void useNotifications.getState().load()
    channel =
      supabase
        ?.channel(`notifications-${uid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (payload) => {
          const row = payload.new as NotificationRow
          useNotifications.getState().push(row)
          void api.notify.show(describeNotification(row, i18n.t, nameOf))
        })
        .subscribe() ?? null
    void remindDueSoon(uid)
    timer = setInterval(() => void remindDueSoon(uid), REMIND_EVERY_MS)
  }

  const sync = (uid: string | null): void => {
    if (uid === currentUid) return
    currentUid = uid
    if (uid) start(uid)
    else {
      stop()
      useNotifications.getState().clear()
    }
  }

  sync(useAuth.getState().session?.user.id ?? null)
  const unsubscribe = useAuth.subscribe((s) => sync(s.session?.user.id ?? null))
  return () => {
    unsubscribe()
    stop()
  }
}
