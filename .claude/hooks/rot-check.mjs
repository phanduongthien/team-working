#!/usr/bin/env node
// Kiểm tra "rot" của cấu hình agent: skill/CLAUDE.md quá hạn review và depends_on không còn tồn tại.
//
//   node .claude/hooks/rot-check.mjs          → chế độ hook SessionStart: không có gì thì im lặng;
//                                               có cảnh báo thì in JSON (systemMessage + additionalContext).
//   node .claude/hooks/rot-check.mjs --full   → báo cáo đầy đủ dạng text cho skill health-check
//                                               (kiểm tra cả cmd:/npm:/mcp:, liệt kê url: để xem tay).
//   Tùy chọn: --root <thư mục repo>, --today YYYY-MM-DD (để test).
//
// Chỉ dùng thư viện chuẩn của Node. Ở chế độ hook mọi lỗi đều bị nuốt và luôn exit 0, để không bao giờ
// làm hỏng phiên Claude Code.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DAY = 24 * 60 * 60 * 1000

function argValue(args, name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

/** Lấy khối metadata: frontmatter `---` của SKILL.md hoặc comment `<!-- -->` đầu CLAUDE.md. */
function metadataBlock(text) {
  const t = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n/g, '\n')
  const m = t.match(/^---\n([\s\S]*?)\n---/) ?? t.match(/^<!--\n([\s\S]*?)\n-->/)
  return m ? m[1] : null
}

/** Parser YAML tối giản cho đúng 3 khóa ta dùng — tránh thêm dependency. */
export function parseMetadata(text) {
  const block = metadataBlock(text)
  if (!block) return null
  const lastVerified = block.match(/^\s*last_verified:\s*['"]?(\d{4}-\d{2}-\d{2})/m)?.[1]
  const days = Number(block.match(/^\s*review_every_days:\s*(\d+)/m)?.[1])
  const deps = []
  let inDeps = false
  for (const line of block.split('\n')) {
    if (/^\s*depends_on:\s*$/.test(line)) inDeps = true
    else if (inDeps && /^\s*-\s+/.test(line))
      deps.push(
        line
          .replace(/^\s*-\s+/, '')
          .trim()
          .replace(/^['"]|['"]$/g, '')
      )
    else if (inDeps && line.trim()) inDeps = false
  }
  if (!lastVerified && !days && deps.length === 0) return null
  return {
    lastVerified,
    reviewEveryDays: Number.isFinite(days) ? days : undefined,
    dependsOn: deps
  }
}

function listTargets(root) {
  const targets = []
  const claudeMd = join(root, 'CLAUDE.md')
  if (existsSync(claudeMd)) targets.push({ name: 'CLAUDE.md', file: claudeMd })
  const skillsDir = join(root, '.claude', 'skills')
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      const file = join(skillsDir, entry.name, 'SKILL.md')
      if (entry.isDirectory() && existsSync(file)) targets.push({ name: entry.name, file })
    }
  }
  return targets
}

function packageDeps(root) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {})
    ])
  } catch {
    return new Set()
  }
}

function mcpServers(root) {
  const names = new Set()
  for (const f of ['.mcp.json', '.claude/settings.json', '.claude/settings.local.json']) {
    try {
      const json = JSON.parse(readFileSync(join(root, f), 'utf8'))
      for (const n of Object.keys(json.mcpServers ?? {})) names.add(n)
    } catch {
      /* không có file → bỏ qua */
    }
  }
  return names
}

function commandWorks(cmd) {
  // shell: true để Windows tìm được shim .cmd (npx, npm). Tên lệnh lấy từ metadata do người duyệt viết.
  const r = spawnSync(`${cmd} --version`, {
    shell: true,
    timeout: 15000,
    stdio: 'pipe',
    windowsHide: true
  })
  return r.status === 0 ? String(r.stdout).trim().split('\n')[0] : null
}

/** Kiểm tra một skill/CLAUDE.md. `full` = chạy cả kiểm tra chậm (lệnh CLI). */
export function checkTarget(root, target, today, full, cache = {}) {
  const meta = parseMetadata(readFileSync(target.file, 'utf8'))
  const result = { name: target.name, meta, overdueDays: 0, missing: [], ok: [], manual: [] }
  if (!meta) return result
  if (meta.lastVerified && meta.reviewEveryDays) {
    const age = Math.floor((today - Date.parse(meta.lastVerified)) / DAY)
    if (age > meta.reviewEveryDays) result.overdueDays = age - meta.reviewEveryDays
  }
  for (const dep of meta.dependsOn) {
    const [kind, ...rest] = dep.split(':')
    const value = rest.join(':')
    if (kind === 'file') {
      ;(existsSync(resolve(root, value)) ? result.ok : result.missing).push(dep)
    } else if (!full) {
      continue
    } else if (kind === 'npm') {
      cache.pkg ??= packageDeps(root)
      ;(cache.pkg.has(value) ? result.ok : result.missing).push(dep)
    } else if (kind === 'mcp') {
      cache.mcp ??= mcpServers(root)
      ;(cache.mcp.has(value) ? result.ok : result.missing).push(dep)
    } else if (kind === 'cmd') {
      cache.cmd ??= {}
      cache.cmd[value] ??= commandWorks(value)
      if (cache.cmd[value]) result.ok.push(`${dep} (${cache.cmd[value]})`)
      else result.missing.push(dep)
    } else {
      result.manual.push(dep)
    }
  }
  return result
}

/** Tối đa 3 dòng cho hook; rỗng nếu không có gì cần báo. */
export function summarize(results) {
  const overdue = results.filter((r) => r.overdueDays > 0)
  const missing = results.filter((r) => r.missing.length > 0)
  if (overdue.length === 0 && missing.length === 0) return []
  const lines = []
  if (overdue.length) {
    lines.push(
      `Quá hạn review: ${overdue.map((r) => `${r.name} (+${r.overdueDays} ngày)`).join(', ')}`
    )
  }
  if (missing.length) {
    const items = missing.flatMap((r) =>
      r.missing.map((d) => `${r.name} → ${d.replace(/^file:/, '')}`)
    )
    lines.push(
      `Phụ thuộc không còn: ${items.slice(0, 3).join(', ')}${items.length > 3 ? ` (+${items.length - 3})` : ''}`
    )
  }
  lines.push('Chạy /health-check để kiểm tra và đề xuất bản sửa.')
  return lines
}

function fullReport(results) {
  const out = []
  for (const r of results) {
    out.push(`## ${r.name}`)
    if (!r.meta) {
      out.push('- NGHI NGỜ: không có metadata (last_verified / review_every_days / depends_on)')
      continue
    }
    out.push(
      `- last_verified: ${r.meta.lastVerified ?? '?'}, review_every_days: ${r.meta.reviewEveryDays ?? '?'}`
    )
    out.push(r.overdueDays > 0 ? `- QUÁ HẠN: ${r.overdueDays} ngày` : '- Hạn review: ổn')
    for (const d of r.missing) out.push(`- HỎNG: ${d}`)
    for (const d of r.manual) out.push(`- XEM TAY: ${d}`)
    out.push(`- Ổn: ${r.ok.length} phụ thuộc`)
    for (const d of r.ok) out.push(`  - ${d}`)
  }
  return out.join('\n')
}

function main() {
  const args = process.argv.slice(2)
  const full = args.includes('--full')
  const here = dirname(fileURLToPath(import.meta.url))
  const root = resolve(
    argValue(args, '--root') ?? process.env.CLAUDE_PROJECT_DIR ?? join(here, '..', '..')
  )
  const todayArg = argValue(args, '--today')
  const today = todayArg ? Date.parse(todayArg) : Date.parse(new Date().toISOString().slice(0, 10))
  const cache = {}
  const results = listTargets(root).map((t) => {
    try {
      return checkTarget(root, t, today, full, cache)
    } catch (err) {
      return {
        name: t.name,
        meta: null,
        overdueDays: 0,
        missing: [],
        ok: [],
        manual: [],
        error: String(err)
      }
    }
  })
  if (full) {
    process.stdout.write(fullReport(results) + '\n')
    return
  }
  const lines = summarize(results)
  if (lines.length === 0) return
  const text = `[chống rot] ${lines.join('\n')}`
  process.stdout.write(
    JSON.stringify({
      systemMessage: text,
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text }
    }) + '\n'
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (err) {
    if (process.argv.includes('--full'))
      process.stderr.write(`rot-check lỗi: ${err?.stack ?? err}\n`)
  }
  process.exitCode = 0
}
