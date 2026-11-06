import { z } from 'zod'
import { IPC } from '@shared/ipc'
import {
  agentClientNameSchema,
  agentLimitsSchema,
  agentPairingSchema,
  idSchema,
  mcpApprovalResponseSchema,
  mcpServerInputSchema
} from '@shared/schemas'
import type { AgentHub } from '../agents/hub'
import type { McpApprovals } from '../mcpClient/approvals'
import type { McpServerStore } from '../mcpClient/store'
import type { HandleFn } from './register'

export type AgentsIpcDeps = {
  handle: HandleFn
  hub: AgentHub
  mcp: McpServerStore
  mcpApprovals: McpApprovals
  /** Lệnh chạy cầu nối stdio cho Claude Desktop (exe + script). */
  bridge: { exe: string; script: string }
}

const errorOf = (err: unknown): { error: string } => ({ error: (err as Error).message })

/** IPC trang "Kết nối agent": MCP server của Mizuki + MCP server người dùng thêm. */
export function registerAgentsIpc({ handle, hub, mcp, mcpApprovals, bridge }: AgentsIpcDeps): void {
  const A = { changes: 'agents' } as const
  const M = { changes: 'mcpServers' } as const
  handle(IPC.agentsStatus, z.undefined(), () => hub.status())
  handle(IPC.agentsSetEnabled, z.boolean(), (on) => hub.setEnabled(on).catch(errorOf), A)
  handle(IPC.agentsSetLimits, agentLimitsSchema, (limits) => hub.setLimits(limits), A)
  // Token chỉ trả về đúng lần tạo này.
  handle(IPC.agentsCreateClient, agentClientNameSchema, (name) => hub.createClient(name, bridge), A)
  handle(IPC.agentsRevoke, idSchema, (id) => hub.revoke(id), A)
  handle(IPC.agentsRespondPairing, agentPairingSchema, ({ clientId, allow }) => hub.respondPairing(clientId, allow), A)
  handle(IPC.agentsStopAll, z.undefined(), () => hub.emergencyStop(), { changes: ['agents', 'agentExchanges'] })
  handle(IPC.agentsExchanges, z.undefined(), () => hub.exchanges(100))

  handle(IPC.mcpList, z.undefined(), () => mcp.list())
  handle(
    IPC.mcpSave,
    mcpServerInputSchema,
    (input) => {
      try {
        return mcp.save(input)
      } catch (err) {
        return errorOf(err)
      }
    },
    M
  )
  handle(IPC.mcpRemove, idSchema, (id) => mcp.remove(id), M)
  handle(IPC.mcpSetEnabled, z.object({ id: idSchema, enabled: z.boolean() }), ({ id, enabled }) => mcp.setEnabled(id, enabled), M)
  handle(IPC.mcpRevokeAlways, z.object({ id: idSchema, tool: z.string().min(1).max(200) }), ({ id, tool }) => mcp.revokeAlways(id, tool), M)
  handle(IPC.mcpRespond, mcpApprovalResponseSchema, ({ id, decision }) => mcpApprovals.respond(id, decision), M)
}
