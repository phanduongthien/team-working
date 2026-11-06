import { SETTINGS_TOPICS, type SyncTopic } from '@shared/sync'

/**
 * Một chỗ duy nhất báo "mục X đã thay đổi" cho renderer. Gom các lần báo trong cùng một lượt chạy
 * (vd ghi settings + IPC xong) thành MỘT sự kiện, mỗi mục một lần.
 */
export class StateSync {
  private pending = new Set<SyncTopic>()
  private scheduled = false

  constructor(
    private readonly send: (topics: SyncTopic[]) => void,
    private readonly defer: (fn: () => void) => void = (fn) => setImmediate(fn)
  ) {}

  changed(...topics: SyncTopic[]): void {
    for (const t of topics) this.pending.add(t)
    if (this.scheduled || this.pending.size === 0) return
    this.scheduled = true
    this.defer(() => this.flush())
  }

  /** Ghi settings theo khoá → báo mục tương ứng (khoá không thuộc mục nào thì bỏ qua). */
  settingsChanged(key: string): void {
    const topic = SETTINGS_TOPICS[key]
    if (topic) this.changed(topic)
  }

  /** Chạy thao tác; dù thành công, trả lỗi hay ném lỗi đều báo đã thay đổi (giữ nguyên kết quả / lỗi). */
  async track<T>(topics: SyncTopic | SyncTopic[], fn: () => T | Promise<T>): Promise<T> {
    try {
      return await fn()
    } finally {
      this.changed(...(Array.isArray(topics) ? topics : [topics]))
    }
  }

  flush(): void {
    this.scheduled = false
    if (this.pending.size === 0) return
    const topics = [...this.pending]
    this.pending.clear()
    this.send(topics)
  }
}
