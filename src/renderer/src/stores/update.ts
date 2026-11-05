import { create } from 'zustand'
import type { UpdateState } from '@shared/update'
import { api } from '@renderer/lib/api'

type UpdateStore = {
  state: UpdateState
  /** Nghe trạng thái từ main; gọi một lần (UpdateCenter). Trả về hàm hủy. */
  init(): () => void
}

export const useUpdate = create<UpdateStore>((set) => ({
  state: { state: 'idle' },
  init() {
    const stop = api.update.onState((state) => set({ state }))
    void api.update.getState().then((state) => set({ state }))
    return stop
  }
}))

/** Bản bắt buộc chưa cài → banner cam cố định trên đầu app. */
export function pendingCritical(state: UpdateState): boolean {
  return (
    (state.state === 'available' || state.state === 'downloading' || state.state === 'downloaded' || state.state === 'error') &&
    !!state.info?.critical
  )
}

/** Định dạng dung lượng tải cho thanh tiến trình. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
