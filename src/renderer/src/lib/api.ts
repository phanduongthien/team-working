import type { TeamWorkingApi } from '@shared/types'

/**
 * Điểm truy cập duy nhất tới API preload. Đọc `window.api` lúc gọi (không lúc import)
 * để module dùng được trong test và dễ mock.
 */
export const api: TeamWorkingApi = new Proxy({} as TeamWorkingApi, {
  get: (_target, key) => window.api[key as keyof TeamWorkingApi]
})
