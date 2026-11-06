import { create } from 'zustand'
import type { ComputerStatus } from '@shared/computer'
import type { SidecarState } from '@shared/sidecar'
import { api } from '@renderer/lib/api'
import { coalesce, onSync, optimistic } from '@renderer/lib/sync'

type ComputerStore = {
  status: ComputerStatus | null
  sidecar: SidecarState | null
  error: string | null
  setEnabled(enabled: boolean, acceptWarning?: boolean): Promise<boolean>
  setScreenAccess(on: boolean): Promise<boolean>
  emergencyStop(): Promise<void>
  clearError(): void
  /** Hỏi lại main trạng thái (mở trang, quay lại cửa sổ). */
  refresh(): Promise<void>
}

const isError = (r: unknown): r is { error: string } => typeof r === 'object' && r !== null && 'error' in r

/** Đổi trạng thái trên giao diện ngay, lưu sau; lỗi → hoàn tác + hiện lỗi trên trang. */
async function patchStatus(
  patch: Partial<ComputerStatus>,
  save: () => Promise<ComputerStatus | { error: string }>
): Promise<boolean> {
  const before = useComputer.getState().status
  if (!before) return false
  const r = await optimistic({
    topic: 'computer',
    apply: () => useComputer.setState({ status: { ...before, ...patch }, error: null }),
    rollback: () => useComputer.setState({ status: before }),
    save,
    onError: (error) => useComputer.setState({ error })
  })
  if (r && !isError(r)) useComputer.setState({ status: r })
  return r !== null
}

export const useComputer = create<ComputerStore>((set) => ({
  status: null,
  sidecar: null,
  error: null,
  setEnabled: (enabled, acceptWarning) =>
    patchStatus({ enabled, ...(acceptWarning ? { warningAccepted: true } : {}) }, () =>
      api.computer.setEnabled(enabled, acceptWarning)
    ),
  setScreenAccess: (on) => patchStatus({ screenAccess: on }, () => api.computer.setScreenAccess(on)),
  async emergencyStop() {
    await api.computer.emergencyStop()
  },
  clearError: () => set({ error: null }),
  refresh: coalesce(async () => {
    const [status, sidecar] = await Promise.all([api.computer.status(), api.sidecar.state()])
    set({ status, sidecar })
  })
}))

/** Nghe trạng thái từ main (dừng khẩn cấp bằng phím tắt có thể xảy ra bất cứ lúc nào). */
export function setupComputer(): () => void {
  const stopStatus = api.computer.onStatus((status) => useComputer.setState({ status }))
  const stopSidecar = api.sidecar.onState((sidecar) => useComputer.setState({ sidecar }))
  const stopSync = onSync(['computer', 'sidecar'], () => useComputer.getState().refresh())
  void useComputer.getState().refresh()
  return () => {
    stopStatus()
    stopSidecar()
    stopSync()
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
