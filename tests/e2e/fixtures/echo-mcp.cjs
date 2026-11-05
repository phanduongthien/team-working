// MCP server stdio tối giản cho test e2e: một tool "echo" trả lại "ECHO:<text>".
'use strict'
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n')
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => {
  buf += c
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'echo', version: '1.0.0' } } })
    } else if (msg.method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { tools: [{ name: 'echo', description: 'Echo back the given text', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] }
      })
    } else if (msg.method === 'tools/call') {
      send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'ECHO:' + ((msg.params.arguments || {}).text || '') }] } })
    } else if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    }
  }
})
process.stdin.on('end', () => process.exit(0))
