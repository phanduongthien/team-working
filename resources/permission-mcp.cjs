// MCP server (stdio) mà Claude Code CLI gọi qua --permission-prompt-tool mcp__twperm__approve
// mỗi khi muốn dùng tool cần quyền (Edit/Write ở chế độ Code). Chuyển yêu cầu về app Team Working
// (HTTP 127.0.0.1 + token) để NGƯỜI DÙNG xem diff và duyệt; lỗi/hết giờ → từ chối.
// Chạy bằng chính Electron với ELECTRON_RUN_AS_NODE=1 — không cần cài Node.
'use strict'

const http = require('node:http')

const URL_BASE = process.env.TW_PERM_URL
const TOKEN = process.env.TW_PERM_TOKEN
const CONVERSATION = process.env.TW_CONVERSATION
const TIMEOUT_MS = 15 * 60 * 1000

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function deny(message) {
  return { behavior: 'deny', message }
}

function askApp(args) {
  return new Promise((resolve) => {
    if (!URL_BASE || !TOKEN) return resolve(deny('Team Working approval bridge unavailable'))
    const body = JSON.stringify({ token: TOKEN, conversationId: CONVERSATION, toolName: args.tool_name, input: args.input })
    const req = http.request(
      `${URL_BASE}/approve`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: TIMEOUT_MS },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            const decision = JSON.parse(data)
            resolve(decision.allow ? { behavior: 'allow', updatedInput: args.input } : deny(decision.message || 'Người dùng đã từ chối thay đổi này.'))
          } catch {
            resolve(deny('Invalid approval response'))
          }
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', () => resolve(deny('Không nhận được phê duyệt từ người dùng.')))
    req.end(body)
  })
}

const TOOL = {
  name: 'approve',
  description: 'Ask the Team Working user to approve a tool call',
  inputSchema: {
    type: 'object',
    properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } },
    required: ['tool_name', 'input']
  }
}

async function handle(msg) {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'twperm', version: '1.0.0' } } })
  } else if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: [TOOL] } })
  } else if (msg.method === 'tools/call') {
    const decision = await askApp(msg.params.arguments || {})
    send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(decision) }] } })
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
