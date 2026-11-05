type Job<T> = {
  run(signal: AbortSignal): Promise<T>
  resolve(v: T): void
  reject(e: Error): void
  controller: AbortController
  onStart?: () => void
}

export class QueueFullError extends Error {
  constructor() {
    super('queue_full')
  }
}

/**
 * Hàng đợi việc từ agent khác: chạy tối đa `concurrency` việc cùng lúc (mặc định 1), hàng chờ có
 * giới hạn. `abortAll()` (dừng khẩn cấp) huỷ việc đang chạy và mọi việc đang chờ.
 */
export class TaskQueue {
  private running = new Set<Job<unknown>>()
  private waiting: Job<unknown>[] = []

  constructor(
    private readonly concurrency: () => number,
    private readonly maxWaiting = 5
  ) {}

  get size(): { running: number; waiting: number } {
    return { running: this.running.size, waiting: this.waiting.length }
  }

  push<T>(run: (signal: AbortSignal) => Promise<T>, onStart?: () => void): Promise<T> {
    if (this.running.size >= this.concurrency() && this.waiting.length >= this.maxWaiting) {
      return Promise.reject(new QueueFullError())
    }
    return new Promise<T>((resolve, reject) => {
      const job: Job<T> = { run, resolve, reject, controller: new AbortController(), onStart }
      this.waiting.push(job as Job<unknown>)
      this.pump()
    })
  }

  abortAll(reason = 'stopped'): void {
    for (const job of this.waiting.splice(0)) job.reject(new Error(reason))
    for (const job of this.running) job.controller.abort(new Error(reason))
  }

  private pump(): void {
    while (this.running.size < this.concurrency() && this.waiting.length > 0) {
      const job = this.waiting.shift()!
      this.running.add(job)
      job.onStart?.()
      job
        .run(job.controller.signal)
        .then(
          (v) => (job.controller.signal.aborted ? job.reject(new Error('stopped')) : job.resolve(v)),
          (e: Error) => job.reject(job.controller.signal.aborted ? new Error('stopped') : e)
        )
        .finally(() => {
          this.running.delete(job)
          this.pump()
        })
    }
  }
}
