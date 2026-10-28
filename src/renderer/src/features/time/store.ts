import { create } from 'zustand'
import { DEFAULT_WORKDAY, type Workday } from '@shared/schemas'
import type { TimeEntry } from '@shared/timesheet'
import type { TimeStartInput } from '@shared/types'
import i18n from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { POMODORO_IDLE, startFocus, tickPomodoro, type PomodoroState } from './pomodoro'

export type TaskRef = Omit<TimeStartInput, 'kind'>

type TimeState = {
  current: TimeEntry | null
  now: number
  workday: Workday
  pomodoro: PomodoroState
  /** Việc đang gắn với Pomodoro (để phiên sau tiếp tục cùng việc). */
  pomodoroTask: TaskRef | null
  /** Đổi mỗi khi dữ liệu chấm công thay đổi → trang timesheet tải lại. */
  version: number

  refresh(): Promise<void>
  startTimer(task: TaskRef): Promise<void>
  stopTimer(): Promise<void>
  startPomodoro(task: TaskRef): Promise<void>
  stopPomodoro(): Promise<void>
  saveWorkday(w: Workday): Promise<void>
  tick(): void
}

export const useTime = create<TimeState>((set, get) => ({
  current: null,
  now: Date.now(),
  workday: DEFAULT_WORKDAY,
  pomodoro: POMODORO_IDLE,
  pomodoroTask: null,
  version: 0,

  async refresh() {
    const [current, workday] = await Promise.all([api.time.current(), api.time.getWorkday()])
    set((s) => ({ current, workday, version: s.version + 1 }))
  },

  async startTimer(task) {
    // Bấm giờ thường thay cho Pomodoro đang chạy.
    set({ pomodoro: POMODORO_IDLE, pomodoroTask: null })
    set({ current: await api.time.start({ ...task, kind: 'timer' }) })
  },

  async stopTimer() {
    await api.time.stop()
    set({ current: null, pomodoro: POMODORO_IDLE })
  },

  async startPomodoro(task) {
    const entry = await api.time.start({ ...task, kind: 'pomodoro' })
    set((s) => ({ current: entry, pomodoroTask: task, pomodoro: startFocus(s.pomodoro, Date.now(), s.workday.focusMinutes) }))
  },

  async stopPomodoro() {
    if (get().pomodoro.phase === 'focus') await api.time.stop()
    set({ pomodoro: POMODORO_IDLE, pomodoroTask: null, current: null })
  },

  async saveWorkday(w) {
    set({ workday: await api.time.setWorkday(w) })
  },

  tick() {
    const now = Date.now()
    const { state, event } = tickPomodoro(get().pomodoro, now, get().workday.breakMinutes)
    set({ now, pomodoro: state })
    if (event === 'focus_done') {
      void api.time.stop().then(() => set({ current: null }))
      void api.notify.show({
        title: i18n.t('time:pomodoro.focusDoneTitle'),
        body: i18n.t('time:pomodoro.focusDoneBody', { minutes: get().workday.breakMinutes }),
        route: '/time'
      })
    } else if (event === 'break_done') {
      void api.notify.show({ title: i18n.t('time:pomodoro.breakDoneTitle'), body: i18n.t('time:pomodoro.breakDoneBody'), route: '/time' })
    }
  }
}))

/** Chạy nền: đồng hồ 1 giây + nghe thay đổi chấm công từ main. */
export function setupTime(): () => void {
  void useTime.getState().refresh()
  const timer = setInterval(() => useTime.getState().tick(), 1000)
  const off = api.time.onChanged(() => void useTime.getState().refresh())
  return () => {
    clearInterval(timer)
    off()
  }
}
