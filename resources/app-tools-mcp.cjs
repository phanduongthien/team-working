// MCP server (stdio) chứa tool của app MMC studio (chụp màn hình…), được Claude Code CLI spawn qua
// --mcp-config. Chỉ là ống dẫn: danh sách tool và mọi lần gọi đều chuyển về app (HTTP 127.0.0.1 + token);
// app kiểm tra quyền, validate input, ghi log. Mất kết nối / sai token → báo lỗi, không làm gì cả.
// Chạy bằng chính Electron với ELECTRON_RUN_AS_NODE=1 — không cần cài Node.
'use strict'

const http = require('node:http')

const URL_BASE = process.env.MMC_TOOLS_URL
const TOKEN = process.env.MMC_TOOLS_TOKEN
const CONVERSATION = process.env.MMC_CONVERSATION
const TIMEOUT_MS = 15 * 60 * 1000

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function post(path, payload) {
  return new Promise((resolve, reject) => {
    if (!URL_BASE || !TOKEN) return reject(new Error('MMC studio tool bridge unavailable'))
    const body = JSON.stringify({ token: TOKEN, conversationId: CONVERSATION, ...payload })
    const req = http.request(
      `${URL_BASE}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: TIMEOUT_MS },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            reject(new Error('Invalid response from MMC studio'))
          }
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end(body)
  })
}

const failure = (text) => ({ content: [{ type: 'text', text }], isError: true })

async function handle(msg) {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'mmc', version: '1.0.0' } } })
  } else if (msg.method === 'tools/list') {
    const result = await post('/list', {}).catch(() => ({ tools: [] }))
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: Array.isArray(result.tools) ? result.tools : [] } })
  } else if (msg.method === 'tools/call') {
    const params = msg.params || {}
    const result = await post('/call', { name: params.name, input: params.arguments || {} }).catch((err) =>
      failure(`Không liên lạc được với MMC studio: ${err.message}`)
    )
    send({ jsonrpc: '2.0', id: msg.id, result })
  } else if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, result: {} })
  }
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
    void handle(msg)
  }
})
process.stdin.on('end', () => process.exit(0))
