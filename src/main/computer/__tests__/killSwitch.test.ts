import { describe, expect, it, vi } from 'vitest'
import { EMERGENCY_HOTKEY, KillSwitch, type ShortcutPort } from '../killSwitch'

function port(taken = false) {
  const registered = new Map<string, () => void>()
  const shortcuts: ShortcutPort = {
    register: vi.fn((a: string, cb: () => void) => (taken ? false : (registered.set(a, cb), true))),
    unregister: vi.fn((a: string) => void registered.delete(a)),
    isRegistered: (a) => registered.has(a)
  }
  return { shortcuts, press: () => registered.get(EMERGENCY_HOTKEY)?.(), isRegistered: () => registered.has(EMERGENCY_HOTKEY) }
}

describe('KillSwitch dùng chung', () => {
  it('nhiều tính năng giữ một phím; chỉ gỡ khi không còn ai giữ', () => {
    const p = port()
    const ks = new KillSwitch(p.shortcuts)
    expect(ks.arm('computer')).toBe(true)
    expect(ks.arm('agents')).toBe(true)
    expect(p.shortcuts.register).toHaveBeenCalledOnce()
    ks.disarm('computer')
    expect(p.isRegistered()).toBe(true)
    expect(ks.isHeldBy('computer')).toBe(false)
    expect(ks.isHeldBy('agents')).toBe(true)
    ks.disarm('agents')
    expect(p.isRegistered()).toBe(false)
    expect(ks.armed).toBe(false)
  })

  it('nhấn phím (hoặc nút trong app) → gọi MỌI listener: dừng cả điều khiển máy lẫn kết nối agent', () => {
    const p = port()
    const ks = new KillSwitch(p.shortcuts)
    const computer = vi.fn()
    const agents = vi.fn()
    ks.onStop(computer)
    ks.onStop(agents)
    ks.arm('agents')
    p.press()
    expect(computer).toHaveBeenCalledWith('hotkey')
    expect(agents).toHaveBeenCalledWith('hotkey')
    ks.trigger()
    expect(agents).toHaveBeenLastCalledWith('button')
  })

  it('app khác chiếm phím → không giữ được', () => {
    const ks = new KillSwitch(port(true).shortcuts)
    expect(ks.arm('agents')).toBe(false)
    expect(ks.isHeldBy('agents')).toBe(false)
  })
})
