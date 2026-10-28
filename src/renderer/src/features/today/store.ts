import { create } from 'zustand'
import type { DayBlock } from '@shared/schemas'
import { dayKey, hhmm } from '@shared/timesheet'
import i18n from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { blocksStartingNow } from './logic'

const key = (date: string): string => `tw.dayplan.${date}`

type Saved = { blocks: DayBlock[]; remind: boolean; notified: string[] }

function load(date: string): Saved {
  try {
    return { blocks: [], remind: true, notified: [], ...(JSON.parse(localStorage.getItem(key(date)) ?? '{}') as Partial<Saved>) }
  } catch {
    return { blocks: [], remind: true, notified: [] }
  }
}

function persist(date: string, saved: Saved): void {
  try {
    localStorage.setItem(key(date), JSON.stringify(saved))
  } catch {
    // tiện ích theo máy — bỏ qua nếu không ghi được
  }
}

type TodayState = Saved & {
  date: string
  setBlocks(blocks: DayBlock[]): void
  setRemind(on: boolean): void
  check(now?: number): void
}

/** Kế hoạch ngày lưu theo máy (localStorage, theo ngày); nhắc giờ khi app đang mở. */
export const useToday = create<TodayState>((set, get) => ({
  date: dayKey(Date.now()),
  ...load(dayKey(Date.now())),

  setBlocks(blocks) {
    const next = { blocks, remind: get().remind, notified: [] }
    persist(get().date, next)
    set(next)
  },

  setRemind(remind) {
    set({ remind })
    persist(get().date, { blocks: get().blocks, remind, notified: get().notified })
  },

  check(now = Date.now()) {
    const date = dayKey(now)
    if (date !== get().date) set({ date, ...load(date) }) // sang ngày mới
    const { blocks, remind, notified } = get()
    if (!remind) return
    const due = blocksStartingNow(blocks, hhmm(now), new Set(notified))
    if (!due.length) return
    for (const b of due) {
      void api.notify.show({
        title: i18n.t('today:plan.reminderTitle', { note: b.note || '…' }).slice(0, 120),
        body: i18n.t('today:plan.reminderBody', { start: b.start, end: b.end }),
        route: '/today'
      })
    }
    const next = [...notified, ...due.map((b) => b.start)]
    set({ notified: next })
    persist(date, { blocks, remind, notified: next })
  }
}))

export function setupToday(): () => void {
  const timer = setInterval(() => useToday.getState().check(), 20_000)
  return () => clearInterval(timer)
}
