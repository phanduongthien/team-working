import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

const MARKER = 'last-version.txt'
const BACKUP_FILE = /^team-working-.+\.db$/

/** Giữ `keep` bản mới nhất, trả về tên các bản cần xóa. */
export function backupsToPrune(files: { name: string; mtimeMs: number }[], keep: number): string[] {
  return files
    .filter((f) => BACKUP_FILE.test(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(keep)
    .map((f) => f.name)
}

/**
 * Lần đầu mở một phiên bản app mới (sau khi cập nhật), sao lưu DB TRƯỚC khi chạy migration —
 * nếu bản mới lỗi vẫn khôi phục được lịch sử chat/cài đặt. Phải gọi trước openDatabase().
 * Lỗi sao lưu không chặn khởi động (chỉ ghi log) và sẽ thử lại ở lần mở sau.
 */
export async function backupBeforeUpgrade(opts: {
  dbFile: string
  backupDir: string
  version: string
  keep?: number
  log: { info(msg: string): void; error(msg: string): void }
  now?: Date
}): Promise<string | null> {
  const marker = join(opts.backupDir, MARKER)
  const last = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null
  if (last === opts.version) return null
  mkdirSync(opts.backupDir, { recursive: true })
  if (!existsSync(opts.dbFile)) {
    writeFileSync(marker, opts.version)
    return null
  }

  // Tên ghi phiên bản đã tạo ra dữ liệu (bản cũ) để biết khôi phục về bản nào.
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[:.]/g, '-')
  const dest = join(opts.backupDir, `team-working-${last ?? 'unknown'}-${stamp}.db`)
  try {
    const db = new Database(opts.dbFile, { fileMustExist: true })
    try {
      await db.backup(dest)
    } finally {
      db.close()
    }
  } catch (err) {
    opts.log.error(`Sao lưu DB trước khi nâng cấp thất bại: ${(err as Error).message}`)
    rmSync(dest, { force: true })
    return null
  }
  writeFileSync(marker, opts.version)
  const files = readdirSync(opts.backupDir).map((name) => ({ name, mtimeMs: statSync(join(opts.backupDir, name)).mtimeMs }))
  for (const name of backupsToPrune(files, opts.keep ?? 3)) rmSync(join(opts.backupDir, name), { force: true })
  opts.log.info(`Đã sao lưu DB (${last ?? 'unknown'} → ${opts.version}): ${dest}`)
  return dest
}
