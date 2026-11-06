import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncTopic } from '@shared/sync'
import { coalesce, onSync, optimistic, resetSyncForTest, useSyncErrors } from '../sync'

/** window.api giả: chỉ cần kênh sync; `emit` = main phát sync:changed. */
let mainListener: ((topics: SyncTopic[]) => void) | null = null
const emit = (...topics: SyncTopic[]): void => mainListener?.(topics)

beforeEach(() => {
  mainListener = null
  vi.stubGlobal('window', {
    api: {
      sync: {
        onChanged: (fn: (topics: SyncTopic[]) => void) => {
          mainListener = fn
          return () => (mainListener = null)
        }
      }
    }
  })
  useSyncErrors.setState({ error: null })
})

afterEach(() => {
  resetSyncForTest()
  vi.unstubAllGlobals()
})

const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('đồng bộ trạng thái (renderer)', () => {
  it('chỉ chạy lại khi main báo đúng mục đang nghe', () => {
    const gmail = vi.fn()
    const skills = vi.fn()
    onSync(['gmail', 'telegram'], gmail)
    onSync('skills', skills)
    emit('telegram')
    emit('voice')
    expect(gmail).toHaveBeenCalledTimes(1)
    expect(skills).not.toHaveBeenCalled()
  })

  it('huỷ nghe → không chạy nữa', () => {
    const fn = vi.fn()
    const off = onSync('voice', fn)
    off()
    emit('voice')
    expect(fn).not.toHaveBeenCalled()
  })

  it('coalesce: đang hỏi lại mà có yêu cầu mới → chạy thêm đúng MỘT lần sau khi xong', async () => {
    const gates = [deferred<void>(), deferred<void>()]
    let calls = 0
    const run = coalesce(() => gates[calls++]?.promise)
    const first = run()
    void run()
    void run()
    expect(calls).toBe(1)
    gates[0].resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toBe(2)
    gates[1].resolve()
    await first
    expect(calls).toBe(2)
  })

  it('coalesce: hỏi lại lỗi không làm hỏng lần sau', async () => {
    let n = 0
    const run = coalesce(() => {
      n++
      if (n === 1) throw new Error('chưa sẵn sàng')
    })
    await run()
    await run()
    expect(n).toBe(2)
  })

  it('optimistic: hiện ngay; lưu xong → hỏi lại mục đó; KHÔNG hỏi lại giữa chừng (tránh giật về giá trị cũ)', async () => {
    let value = 'cũ'
    const refresh = vi.fn()
    onSync('skills', refresh)
    const save = deferred<{ ok: true }>()
    const done = optimistic({
      topic: 'skills',
      apply: () => (value = 'mới'),
      rollback: () => (value = 'cũ'),
      save: () => save.promise
    })
    expect(value).toBe('mới')
    emit('skills') // vd focus / sự kiện đến khi đang lưu
    expect(refresh).not.toHaveBeenCalled()
    save.resolve({ ok: true })
    await expect(done).resolves.toEqual({ ok: true })
    expect(value).toBe('mới')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('optimistic: lưu trả { error } → hoàn tác + báo lỗi chung', async () => {
    let value = 'cũ'
    const r = await optimistic({
      topic: 'gmail',
      apply: () => (value = 'mới'),
      rollback: () => (value = 'cũ'),
      save: async () => ({ error: 'label_taken' })
    })
    expect(r).toBeNull()
    expect(value).toBe('cũ')
    expect(useSyncErrors.getState().error?.code).toBe('label_taken')
  })

  it('optimistic: lưu ném lỗi → hoàn tác + báo qua onError riêng (không hiện thông báo chung)', async () => {
    let value = 1
    const onError = vi.fn()
    await optimistic({
      topic: 'computer',
      apply: () => (value = 2),
      rollback: () => (value = 1),
      save: () => Promise.reject(new Error("Error invoking remote method 'x': invalid_input")),
      onError
    })
    expect(value).toBe(1)
    expect(onError).toHaveBeenCalledWith('invalid_input')
    expect(useSyncErrors.getState().error).toBeNull()
  })
})

describe('coalesce — khe giữa hai microtask', () => {
  it('yêu cầu đến đúng lúc vòng chạy vừa xong (chưa dọn) vẫn được chạy thêm', async () => {
    let n = 0
    let late: Promise<void> | null = null
    const run = coalesce(async () => {
      n++
      // Yêu cầu mới đến sau khi lần chạy này đã đọc xong dữ liệu.
      if (n === 1) queueMicrotask(() => (late = run()))
    })
    await run()
    await late
    expect(n).toBe(2)
  })
})
