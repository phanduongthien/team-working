export type PomodoroPhase = 'idle' | 'focus' | 'break'

export type PomodoroState = {
  phase: PomodoroPhase
  /** Thời điểm kết thúc phase hiện tại (ms); null khi idle. */
  endsAt: number | null
  /** Số phiên tập trung đã hoàn thành. */
  completed: number
}

export const POMODORO_IDLE: PomodoroState = { phase: 'idle', endsAt: null, completed: 0 }

export type PomodoroEvent = 'focus_done' | 'break_done' | null

/**
 * Bước tiếp theo của Pomodoro tại thời điểm `now` (hàm thuần):
 * hết phiên tập trung → sang nghỉ (đếm +1); hết giờ nghỉ → về idle chờ người dùng bắt đầu phiên mới.
 */
export function tickPomodoro(
  state: PomodoroState,
  now: number,
  breakMinutes: number
): { state: PomodoroState; event: PomodoroEvent } {
  if (state.phase === 'idle' || state.endsAt === null || now < state.endsAt) return { state, event: null }
  if (state.phase === 'focus') {
    return {
      state: { phase: 'break', endsAt: now + breakMinutes * 60_000, completed: state.completed + 1 },
      event: 'focus_done'
    }
  }
  return { state: { ...state, phase: 'idle', endsAt: null }, event: 'break_done' }
}

export function startFocus(state: PomodoroState, now: number, focusMinutes: number): PomodoroState {
  return { ...state, phase: 'focus', endsAt: now + focusMinutes * 60_000 }
}

/** "mm:ss" còn lại. */
export function remaining(endsAt: number | null, now: number): string {
  const sec = Math.max(0, Math.ceil(((endsAt ?? now) - now) / 1000))
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}
