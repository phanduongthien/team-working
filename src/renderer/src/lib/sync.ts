import { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { SyncTopic } from '@shared/sync'
import { api } from './api'

/**
 * Đồng bộ trạng thái toàn app (renderer).
 * - Main phát `sync:changed` theo mục sau MỌI thay đổi (IPC có `changes`, ghi settings, việc nền).
 * - `useSync` / `useSyncedState`: trang tự hỏi lại khi mở, khi cửa sổ focus / hiện lại, khi nhận sự kiện.
 * - `optimistic`: thao tác người dùng hiện ngay, lưu chạy sau; lỗi → hoàn tác + báo lỗi.
 * Trong lúc một mục đang lưu, các lần hỏi lại mục đó được hoãn tới khi lưu xong (không "giật" về giá trị cũ).
 */

type Topics = SyncTopic | readonly SyncTopic[]
type Listener = { topics: readonly SyncTopic[]; run(): void }

const listeners = new Set<Listener>()
const saving = new Map<SyncTopic, number>()
let offMain: (() => void) | null = null

const list = (topics: Topics): readonly SyncTopic[] => (typeof topics === 'string' ? [topics] : topics)
const isSaving = (topics: readonly SyncTopic[]): boolean => topics.some((t) => (saving.get(t) ?? 0) > 0)

/** Báo các mục vừa đổi cho mọi nơi đang nghe (từ main, hoặc khi một lần lưu ở renderer kết thúc). */
export function notifyChanged(topics: Topics): void {
  const changed = list(topics)
  for (const l of listeners) {
    if (!l.topics.some((t) => changed.includes(t))) continue
    trigger(l)
  }
}

/** Mục đang lưu → bỏ qua: khi lưu xong `optimistic` sẽ báo lại mục đó. */
function trigger(l: Listener): void {
  if (!isSaving(l.topics)) l.run()
}

/**
 * Gói hàm hỏi lại: đang chạy mà có yêu cầu mới → chạy lại đúng MỘT lần sau khi xong
 * (không chạy chồng, không lỡ thay đổi, kết quả cuối luôn là mới nhất). Lỗi khi hỏi lại bị bỏ qua.
 */
export function coalesce(fn: () => unknown): () => Promise<void> {
  let running: Promise<void> | null = null
  let again = false
  const run = (): Promise<void> => {
    if (running) {
      again = true
      // Vòng chạy vừa kết thúc nhưng chưa kịp dọn (khe giữa hai microtask) → tự chạy thêm sau khi dọn.
      return running.then(() => (again ? run() : undefined))
    }
    const loop = async (): Promise<void> => {
      do {
        again = false
        try {
          await fn()
        } catch {
          // Hỏi lại lỗi (vd IPC chưa sẵn sàng) — lần đồng bộ sau sẽ thử lại.
        }
      } while (again)
    }
    // .finally luôn chạy SAU khi gán `running` (kể cả khi fn xong ngay, không await gì).
    const p = loop().finally(() => {
      running = null
    })
    running = p
    return p
  }
  return run
}

/** Nghe thay đổi của các mục (ngoài React: store zustand, setup của feature). Trả về hàm huỷ. */
export function onSync(topics: Topics, run: () => unknown): () => void {
  offMain ??= api.sync.onChanged((changed) => notifyChanged(changed))
  const l: Listener = { topics: list(topics), run: () => void run() }
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/**
 * Trang dùng trạng thái từ main: gọi `refresh` khi mở, khi cửa sổ app focus / hiện lại (vd quay về sau khi
 * đăng nhập trên trình duyệt), và khi main báo một trong các mục đã đổi. Không cần làm mới theo chu kỳ.
 */
export function useSync(topics: Topics, refresh: () => unknown): void {
  const key = list(topics).join(',')
  const ref = useRef(refresh)
  useEffect(() => {
    ref.current = refresh
  })
  useEffect(() => {
    const ts = key.split(',') as SyncTopic[]
    const run = coalesce(() => ref.current())
    const off = onSync(ts, run)
    const l: Listener = { topics: ts, run: () => void run() }
    const onFocus = (): void => trigger(l)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') trigger(l)
    }
    void run()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [key])
}

/** Trạng thái riêng của một trang, lấy từ main và tự đồng bộ (xem `useSync`). */
export function useSyncedState<T>(
  topics: Topics,
  fetcher: () => Promise<T>
): { data: T | null; setData(value: T | ((prev: T) => T)): void; refresh(): Promise<void> } {
  const [data, set] = useState<T | null>(null)
  const ref = useRef(fetcher)
  useEffect(() => {
    ref.current = fetcher
  })
  // useSync tự gộp các lần hỏi lại dồn dập.
  const refresh = useCallback(async () => set(await ref.current()), [])
  useSync(topics, refresh)
  const setData = useCallback(
    (value: T | ((prev: T) => T)) =>
      set((prev) => (typeof value === 'function' ? (prev === null ? prev : (value as (p: T) => T)(prev)) : value)),
    []
  )
  return { data, setData, refresh }
}

/** Kết quả IPC có phải lỗi nghiệp vụ `{ error }` không. */
export const isErrorResult = (r: unknown): r is { error: string } =>
  typeof r === 'object' && r !== null && 'error' in r && typeof (r as { error: unknown }).error === 'string'

/** Lỗi lưu gần nhất (hiện ở góc màn hình — SyncErrorToast). */
export const useSyncErrors = create<{ error: { code: string; key: number } | null; clear(): void }>((set) => ({
  error: null,
  clear: () => set({ error: null })
}))
let errorKey = 0
export function reportSaveError(code: string): void {
  useSyncErrors.setState({ error: { code, key: ++errorKey } })
}

/**
 * Thao tác của người dùng: `apply` cập nhật giao diện NGAY, `save` chạy sau. `save` ném lỗi hoặc trả
 * `{ error }` → `rollback` + báo lỗi (`onError`, mặc định hiện thông báo chung). Xong (thành công hay lỗi)
 * → hỏi lại mục `topic` từ main để giao diện khớp trạng thái thật.
 * Trả về kết quả của `save`, hoặc null nếu lỗi.
 */
export async function optimistic<R>(opts: {
  topic: SyncTopic
  apply(): void
  rollback(): void
  save(): Promise<R>
  onError?(code: string): void
}): Promise<Exclude<R, { error: string }> | null> {
  const { topic } = opts
  saving.set(topic, (saving.get(topic) ?? 0) + 1)
  opts.apply()
  let failed: string | null = null
  let result: R | undefined
  try {
    result = await opts.save()
    if (isErrorResult(result)) failed = result.error
  } catch (err) {
    failed = /invalid_input/.test(String(err)) ? 'invalid_input' : (err as Error).message || 'save_failed'
  }
  if (failed !== null) {
    opts.rollback()
    ;(opts.onError ?? reportSaveError)(failed)
  }
  const left = (saving.get(topic) ?? 1) - 1
  if (left > 0) saving.set(topic, left)
  else {
    saving.delete(topic)
    // Hỏi lại mọi nơi nghe mục này (kể cả những lần bị bỏ qua trong lúc lưu).
    notifyChanged(topic)
  }
  return failed === null ? (result as Exclude<R, { error: string }>) : null
}

/** Chỉ cho unit test: xoá mọi listener / trạng thái lưu. */
export function resetSyncForTest(): void {
  listeners.clear()
  saving.clear()
  offMain?.()
  offMain = null
}
