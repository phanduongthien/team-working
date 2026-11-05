// Cầu nối stdio ↔ HTTP để Claude Desktop (cấu hình local chỉ hỗ trợ MCP server stdio) dùng được Mizuki.
// Mỗi dòng JSON-RPC từ stdin được POST tới MIZUKI_URL kèm "Authorization: Bearer MIZUKI_TOKEN"; phản hồi
// JSON được ghi ra stdout. MMC studio phải đang mở và đã bật "Kết nối agent".
// Chạy bằng chính MMC studio.exe với ELECTRON_RUN_AS_NODE=1 — không cần cài Node.
'use strict'

const URL_ = process.env.MIZUKI_URL
const TOKEN = process.env.MIZUKI_TOKEN

function out(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function fail(id, message) {
  if (id !== undefined && id !== null) out({ jsonrpc: '2.0', id, error: { code: -32001, message } })
}

async function forward(msg) {
  if (!URL_ || !TOKEN) return fail(msg.id, 'Thiếu MIZUKI_URL / MIZUKI_TOKEN trong cấu hình.')
  let res
  try {
    res = await fetch(URL_, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${TOKEN}`
      },
      body: JSON.stringify(msg)
    })
  } catch {
    return fail(msg.id, 'Không kết nối được MMC studio. Hãy mở app và bật "Kết nối agent".')
  }
  if (res.status === 202) return // notification: không có phản hồi
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    return fail(msg.id, `Phản hồi không hợp lệ từ MMC studio (HTTP ${res.status}).`)
  }
  if (!res.ok) {
    const reason = (data && (data.message || data.error)) || `HTTP ${res.status}`
    return fail(msg.id, `MMC studio từ chối: ${reason}`)
  }
  for (const m of Array.isArray(data) ? data : [data]) if (m) out(m)
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let i
  while ((i = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, i).trim()
    buffer = buffer.slice(i + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    void forward(msg)
  }
})
process.stdin.on('end', () => setTimeout(() => process.exit(0), 200))
