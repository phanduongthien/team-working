import { readFile } from 'node:fs/promises'
import { release as osRelease } from 'node:os'
import { app } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import { sanitizeLog } from '@shared/release'
import { completeText, type AIProvider } from '../ai/AIProvider'
import { buildIssuePrompt, parseIssue } from '../assistant/issue'
import type { HandleFn } from './register'

export type AppIpcDeps = {
  handle: HandleFn
  log: { file: string; error(msg: string): void; warn(msg: string): void }
  installUpdate(): void
  getProvider(): AIProvider
  loadSkill(name: string): Promise<string | undefined>
  workspaceDir: string
}

const LOG_TAIL_LINES = 40

/** IPC chung của app: cập nhật, ghi lỗi giao diện, thông tin báo lỗi, chuẩn hóa ý tưởng thành issue. */
export function registerAppIpc(deps: AppIpcDeps): void {
  const { handle } = deps

  handle(IPC.updateInstall, z.undefined(), () => deps.installUpdate())

  handle(IPC.appLogError, z.string().max(4000), (message) => deps.log.error(`renderer: ${message}`))

  handle(IPC.appBugInfo, z.undefined(), async () => {
    const text = await readFile(deps.log.file, 'utf8').catch(() => '')
    const tail = text.trimEnd().split('\n').slice(-LOG_TAIL_LINES).join('\n')
    return {
      version: app.getVersion(),
      os: `Windows ${osRelease()} (${process.arch})`,
      logTail: sanitizeLog(tail)
    }
  })

  handle(
    IPC.ideasFormat,
    z.object({
      title: z.string().max(200),
      description: z.string().trim().min(1).max(5000),
      kind: z.enum(['idea', 'bug']),
      language: z.enum(['vi', 'en'])
    }),
    async (input) => {
      const result = await completeText(
        deps.getProvider(),
        {
          prompt: buildIssuePrompt(input),
          systemPrompt: (await deps.loadSkill('issue-writer')) ?? '',
          mode: 'free',
          cwd: deps.workspaceDir,
          ephemeral: true
        },
        AbortSignal.timeout(180_000)
      )
      if ('error' in result) return result
      const draft = parseIssue(result.text, input.kind)
      if (!draft) {
        deps.log.warn(`Ý tưởng: đầu ra sai định dạng: ${result.text.slice(0, 300)}`)
        return { error: 'invalid_output' }
      }
      return draft
    }
  )
}
