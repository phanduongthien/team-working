import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 5 * 1024 * 1024

export type Logger = {
  info(msg: string): void
  warn(msg: string): void
  error(msg: string): void
  readonly file: string
}

/** Ghi log ra %APPDATA%/Team Working/logs/main.log, xoay vòng khi quá 5MB. */
export function createLogger(dir: string): Logger {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'main.log')

  const write = (level: string, msg: string): void => {
    const line = `${new Date().toISOString()} [${level}] ${msg}\n`
    try {
      if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) {
        renameSync(file, `${file}.1`)
      }
      appendFileSync(file, line, 'utf8')
    } catch {
      // Không để lỗi ghi log làm sập app.
    }
    if (level === 'ERROR') console.error(line.trimEnd())
  }

  return {
    file,
    info: (m) => write('INFO', m),
    warn: (m) => write('WARN', m),
    error: (m) => write('ERROR', m)
  }
}
