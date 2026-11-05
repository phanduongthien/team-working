import { create } from 'zustand'
import type { ComputerStatus } from '@shared/computer'
import type { SidecarState } from '@shared/sidecar'
import { api } from '@renderer/lib/api'

type ComputerStore = {
  status: ComputerStatus | null
  sidecar: SidecarState | null
  error: string | null
  setEnabled(enabled: boolean, acceptWarning?: boolean): Promise<boolean>
  setScreenAccess(on: boolean): Promise<boolean>
  emergencyStop(): Promise<void>
  clearError(): void
}

const isError = (r: unknown): r is { error: string } => typeof r === 'object' && r !== null && 'error' in r

export const useComputer = create<ComputerStore>((set) => ({
  status: null,
  sidecar: null,
  error: null,
  async setEnabled(enabled, acceptWarning) {
    const r = await api.computer.setEnabled(enabled, acceptWarning)
    if (isError(r)) {
      set({ error: r.error })
      return false
    }
    set({ status: r, error: null })
    return true
  },
  async setScreenAccess(on) {
    const r = await api.computer.setScreenAccess(on)
    if (isError(r)) {
      set({ error: r.error })
      return false
    }
    set({ status: r, error: null })
    return true
  },
  async emergencyStop() {
    await api.computer.emergencyStop()
  },
  clearError: () => set({ error: null })
}))

/** Nghe trạng thái từ main (dừng khẩn cấp bằng phím tắt có thể xảy ra bất cứ lúc nào). */
export function setupComputer(): () => void {
  const stopStatus = api.computer.onStatus((status) => useComputer.setState({ status }))
  const stopSidecar = api.sidecar.onState((sidecar) => useComputer.setState({ sidecar }))
  void api.computer.status().then((status) => useComputer.setState({ status }))
  void api.sidecar.state().then((sidecar) => useComputer.setState({ sidecar }))
  return () => {
    stopStatus()
    stopSidecar()
  }
}

export const toMb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1)

/** Ghép phím tắt để hiển thị: Control+Alt+Q → Ctrl + Alt + Q. */
export function formatHotkey(accelerator: string): string {
  return accelerator
    .split('+')
    .map((k) => (k === 'Control' ? 'Ctrl' : k))
    .join(' + ')
}
