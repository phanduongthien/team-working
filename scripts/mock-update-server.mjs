#!/usr/bin/env node
// Server cập nhật giả lập (electron-updater "generic" provider) để thử luồng cập nhật trên máy,
// KHÔNG cần tạo Release thật trên GitHub. Dùng cho test e2e và tự kiểm thử (xem docs/release.md).
//
//   node scripts/mock-update-server.mjs [--port 8765] [--version 9.9.9] [--title "MMC studio 9.9.9 [critical]"]
//        [--notes "Dòng 1\nDòng 2"] [--dir release/0.3.1] [--kbps 512] [--config out.yml]
//
// --dir     : phục vụ thư mục build thật (chứa latest.yml + setup.exe) → thử được cả bước cài đặt.
//             Không có --dir: phục vụ một file cài đặt giả (chỉ thử được tới bước "đã tải xong").
// --kbps    : giới hạn tốc độ tải để nhìn thấy thanh tiến trình.
// --config  : ghi file cấu hình cho app (đặt MMC_UPDATE_CONFIG=<file> khi chạy app chưa đóng gói).
// --cache   : thư mục cache tải về trong %LOCALAPPDATA% (mặc định mmc-studio-updater-test). File đã tải
//             và khớp sha512 sẽ được dùng lại — xóa thư mục này để thử lại bước tải từ đầu.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: opts } = parseArgs({
  options: {
    port: { type: 'string', default: '8765' },
    version: { type: 'string', default: '9.9.9' },
    title: { type: 'string' },
    notes: { type: 'string' },
    dir: { type: 'string' },
    kbps: { type: 'string' },
    config: { type: 'string' },
    cache: { type: 'string', default: 'mmc-studio-updater-test' }
  }
})

const port = Number(opts.port)
const yamlString = (s) => JSON.stringify(s) // JSON string là YAML hợp lệ (escape \n, dấu nháy…)

/** Nội dung các file được phục vụ: tên → Buffer. */
const files = new Map()

if (opts.dir) {
  const dir = resolve(opts.dir)
  const yml = join(dir, 'latest.yml')
  if (!existsSync(yml)) throw new Error(`Không thấy ${yml} — build bằng npm run build:win trước`)
  let text = readFileSync(yml, 'utf8')
  const path = /^path: (.+)$/m.exec(text)?.[1]?.trim()
  if (!path) throw new Error('latest.yml thiếu "path"')
  files.set(path, readFileSync(join(dir, path)))
  if (opts.title) text += `releaseName: ${yamlString(opts.title)}\n`
  if (opts.notes) text += `releaseNotes: ${yamlString(opts.notes)}\n`
  files.set('latest.yml', Buffer.from(text))
} else {
  // File "cài đặt" giả 2 MB — đủ để thấy tiến trình; sha512 tính thật để electron-updater chấp nhận.
  const name = `mmc-studio-${opts.version}-setup.exe`
  const body = Buffer.alloc(2 * 1024 * 1024, 7)
  const sha512 = createHash('sha512').update(body).digest('base64')
  files.set(name, body)
  const lines = [
    `version: ${opts.version}`,
    'files:',
    `  - url: ${name}`,
    `    sha512: ${sha512}`,
    `    size: ${body.length}`,
    `path: ${name}`,
    `sha512: ${sha512}`,
    `releaseDate: ${yamlString(new Date().toISOString())}`,
    `releaseName: ${yamlString(opts.title ?? `MMC studio ${opts.version}`)}`,
    `releaseNotes: ${yamlString(opts.notes ?? '<ul><li>Bản thử nghiệm từ server giả lập</li></ul>')}`
  ]
  files.set('latest.yml', Buffer.from(lines.join('\n') + '\n'))
}

if (opts.config) {
  writeFileSync(
    opts.config,
    `provider: generic\nurl: http://127.0.0.1:${port}/\nupdaterCacheDirName: ${opts.cache}\n`
  )
}

const bytesPerTick = opts.kbps ? Math.max(1, Math.round((Number(opts.kbps) * 1024) / 10)) : 0

const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname.slice(1))
  const body = files.get(name)
  console.log(`${req.method} /${name} → ${body ? 200 : 404}`)
  if (!body) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'Content-Length': body.length, 'Content-Type': 'application/octet-stream' })
  if (!bytesPerTick || name.endsWith('.yml')) {
    res.end(body)
    return
  }
  let offset = 0
  const timer = setInterval(() => {
    res.write(body.subarray(offset, offset + bytesPerTick))
    offset += bytesPerTick
    if (offset >= body.length) {
      clearInterval(timer)
      res.end()
    }
  }, 100)
  res.on('close', () => clearInterval(timer))
})

server.listen(port, '127.0.0.1', () => {
  console.log(
    `Mock update server: http://127.0.0.1:${port}/ (latest.yml → ${[...files.keys()].join(', ')})`
  )
})
