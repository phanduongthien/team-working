import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, describe, expect, it } from 'vitest'
import { KillSwitch, type ShortcutPort } from '../../computer/killSwitch'
import { agentHttpServer } from '../httpServer'
import { AgentHub, DEFAULT_AGENT_SETTINGS, type AgentSettings, type StoredClient } from '../hub'

// Như Claude Desktop: SDK client nói stdio với cầu nối, cầu nối gọi HTTP tới MCP server của app.
const BRIDGE = join(__dirname, '..', '..', '..', '..', 'resources', 'mizuki-mcp-bridge.cjs')

let hub: AgentHub
afterEach(async () => {
  await hub?.setEnabled(false)
})

function makeHub(): AgentHub {
  let settings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS, port: 0 }
  let clients: StoredClient[] = []
  const keys = new Set<string>()
  const shortcuts: ShortcutPort = { register: (a) => (keys.add(a), true), unregister: (a) => void keys.delete(a), isRegistered: (a) => keys.has(a) }
  return new AgentHub({
    getSettings: () => settings,
    setSettings: (s) => void (settings = s),
    getClients: () => clients,
    setClients: (l) => void (clients = l),
    exchanges: { insert: () => {}, update: () => {}, get: () => null, list: () => [] },
    killSwitch: new KillSwitch(shortcuts),
    serverFactory: (h) => agentHttpServer(h, () => 'Mizuki', { warn: () => {} }),
    answer: async ({ request }) => `OK: ${request}`,
    emitStatus: () => {},
    emitNotice: () => {},
    log: { info: () => {}, warn: () => {} }
  })
}

const stdioClient = async (env: Record<string, string>): Promise<Client> => {
  const client = new Client({ name: 'claude-desktop-giả', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [BRIDGE], env: { ...(process.env as Record<string, string>), ...env } }))
  return client
}

describe('cầu nối stdio cho Claude Desktop', () => {
  it('liệt kê và gọi tool qua cầu nối', async () => {
    hub = makeHub()
    const { url } = await hub.setEnabled(true)
    const { token, client } = hub.createClient('Claude Desktop', { exe: 'x', script: 'y' })
    hub.respondPairing(client.id, true)
    const mcp = await stdioClient({ MIZUKI_URL: url!, MIZUKI_TOKEN: token })
    try {
      expect((await mcp.listTools()).tools.map((t) => t.name)).toContain('ask_mizuki')
      const r = await mcp.callTool({ name: 'ask_mizuki', arguments: { message: 'chào' } })
      expect(r.content).toEqual([{ type: 'text', text: 'OK: chào' }])
    } finally {
      await mcp.close()
    }
  })

  it('app chưa mở / sai token → báo lỗi rõ ràng thay vì treo', async () => {
    await expect(stdioClient({ MIZUKI_URL: 'http://127.0.0.1:9/mcp', MIZUKI_TOKEN: 'mzk_x' })).rejects.toThrow(/Không kết nối được MMC studio/)
    hub = makeHub()
    const { url } = await hub.setEnabled(true)
    await expect(stdioClient({ MIZUKI_URL: url!, MIZUKI_TOKEN: 'mzk_sai' })).rejects.toThrow(/invalid_token/)
  })
})
