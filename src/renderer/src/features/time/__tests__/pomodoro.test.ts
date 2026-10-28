import { describe, expect, it } from 'vitest'
import { POMODORO_IDLE, remaining, startFocus, tickPomodoro } from '../pomodoro'

describe('Pomodoro', () => {
  const t0 = 1_000_000

  it('focus → hết giờ → nghỉ (đếm phiên) → hết nghỉ → idle', () => {
    let s = startFocus(POMODORO_IDLE, t0, 25)
    expect(tickPomodoro(s, t0 + 60_000, 5)).toEqual({ state: s, event: null })

    const afterFocus = tickPomodoro(s, t0 + 25 * 60_000, 5)
    expect(afterFocus.event).toBe('focus_done')
    s = afterFocus.state
    expect(s).toEqual({ phase: 'break', endsAt: t0 + 30 * 60_000, completed: 1 })

    const afterBreak = tickPomodoro(s, t0 + 30 * 60_000, 5)
    expect(afterBreak).toEqual({ state: { phase: 'idle', endsAt: null, completed: 1 }, event: 'break_done' })
  })

  it('idle không làm gì; remaining định dạng mm:ss', () => {
    expect(tickPomodoro(POMODORO_IDLE, t0, 5).event).toBeNull()
    expect(remaining(t0 + 125_000, t0)).toBe('02:05')
    expect(remaining(t0 - 5, t0)).toBe('00:00')
  })
})
