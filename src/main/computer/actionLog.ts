import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type ActionEntry = {
  conversationId: string
  tool: string
  input: unknown
  ok: boolean
  /** Mô tả ngắn kết quả (không chứa ảnh). */
  summary: string
  /** Ảnh chụp kèm (PNG) — lưu thành file riêng để người dùng xem lại. */
  image?: Buffer
}

const DAY_DIR = /^\d{4}-\d{2}-\d{2}$/

/** Ngày theo giờ máy (YYYY-MM-DD) — thư mục log mỗi ngày một thư mục. */
export function dayKey(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Các thư mục ngày cũ hơn `keepDays` ngày (tính cả hôm nay). */
export function daysToPrune(names: string[], today: Date, keepDays: number): string[] {
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - (keepDays - 1))
  const min = dayKey(cutoff)
  return names.filter((n) => DAY_DIR.test(n) && n < min)
}

/**
 * Nhật ký mọi hành động điều khiển máy tính: `logs/computer-use/<ngày>/actions.jsonl` + ảnh PNG.
 * Ảnh màn hình có thể chứa thông tin riêng tư → chỉ giữ `keepDays` ngày.
 */
export class ActionLog {
  constructor(
    readonly dir: string,
    private readonly keepDays = 7,
    private readonly now: () => Date = () => new Date()
  ) {}

  async record(entry: ActionEntry): Promise<void> {
    const at = this.now()
    const dayDir = join(this.dir, dayKey(at))
    await mkdir(dayDir, { recursive: true })
    let imageFile: string | undefined
    if (entry.image) {
      const stamp = at.toTimeString().slice(0, 8).replace(/:/g, '')
      imageFile = `${stamp}-${entry.tool}-${randomUUID().slice(0, 8)}.png`
      await writeFile(join(dayDir, imageFile), entry.image)
    }
    const line = {
      at: at.toISOString(),
      conversationId: entry.conversationId,
      tool: entry.tool,
      input: entry.input,
      ok: entry.ok,
      summary: entry.summary,
      ...(imageFile ? { image: imageFile } : {})
    }
    await appendFile(join(dayDir, 'actions.jsonl'), JSON.stringify(line) + '\n', 'utf8')
  }

  async prune(): Promise<void> {
    const names = await readdir(this.dir).catch(() => [] as string[])
    for (const name of daysToPrune(names, this.now(), this.keepDays)) {
      await rm(join(this.dir, name), { recursive: true, force: true })
    }
  }
}
