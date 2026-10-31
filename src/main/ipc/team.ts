import { Notification, shell, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import {
  accountRecordSchema,
  accountRememberSchema,
  desktopNotificationSchema,
  idSchema,
  feedbackCoachSchema,
  feedbackSummarySchema,
  planRequestSchema,
  type PlanResult,
  type TextResult
} from '@shared/schemas'
import { completeText, type AIProvider } from '../ai/AIProvider'
import { buildCoachPrompt, buildSummaryPrompt, cleanText } from '../feedback/prompts'
import { buildPlanPrompt, parsePlan } from '../planner/taskPlan'
import { isAllowedAuthorizeUrl, type OAuthLoopback } from '../services/oauthLoopback'
import type { SavedAccountStore } from '../services/savedAccounts'
import type { HandleFn } from './register'

export type TeamIpcDeps = {
  handle: HandleFn
  oauth: OAuthLoopback
  accounts: SavedAccountStore
  supabaseUrl: string | undefined
  getWindow(): BrowserWindow | null
  getProvider(): AIProvider
  loadSkill(name: string): Promise<string | undefined>
  workspaceDir: string
  log: { warn(msg: string): void }
}

const PLAN_TIMEOUT_MS = 240_000

function focusWindow(win: BrowserWindow | null): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/** IPC cho phần team: đăng nhập OAuth, thông báo Windows, trợ lý chia việc. */
export function registerTeamIpc(deps: TeamIpcDeps): void {
  const { handle } = deps
  const none = z.undefined()

  handle(IPC.authOAuth, z.url(), async (url) => {
    if (!isAllowedAuthorizeUrl(url, deps.supabaseUrl)) return { error: 'invalid_authorize_url' }
    const result = await deps.oauth.waitForCode(() => shell.openExternal(url))
    focusWindow(deps.getWindow())
    return result
  })
  handle(IPC.authCancel, none, () => deps.oauth.cancel())

  // Tài khoản đã đăng nhập trên máy (đổi nhanh).
  const { accounts } = deps
  handle(IPC.accountsList, none, () => accounts.list())
  handle(IPC.accountsRecord, accountRecordSchema, ({ account, session }) => accounts.record(account, session))
  handle(IPC.accountsRemember, accountRememberSchema, ({ id, remember, session }) => accounts.remember(id, remember, session))
  handle(IPC.accountsSession, idSchema, (id) => accounts.session(id))
  handle(IPC.accountsDropSession, idSchema, (id) => accounts.dropSession(id))
  handle(IPC.accountsForget, idSchema, (id) => accounts.forget(id))

  handle(IPC.notifyShow, desktopNotificationSchema, ({ title, body, route }) => {
    const win = deps.getWindow()
    // Đang dùng app thì chỉ hiện trong app (chuông), không làm phiền bằng toast.
    if (!Notification.isSupported() || win?.isFocused()) return
    const toast = new Notification({ title, body })
    toast.on('click', () => {
      focusWindow(win)
      if (route) win?.webContents.send(IPC.appNavigate, route)
    })
    toast.show()
  })

  /** Gọi skill feedback-coach một lượt, trả văn bản đã làm sạch. */
  const coachText = async (prompt: string): Promise<TextResult> => {
    const skill = (await deps.loadSkill('feedback-coach')) ?? ''
    const result = await completeText(
      deps.getProvider(),
      { prompt, systemPrompt: skill, mode: 'free', cwd: deps.workspaceDir, ephemeral: true },
      AbortSignal.timeout(PLAN_TIMEOUT_MS)
    )
    return 'error' in result ? result : { text: cleanText(result.text) }
  }

  handle(IPC.feedbackCoach, feedbackCoachSchema, (req) => coachText(buildCoachPrompt(req)))
  handle(IPC.feedbackSummarize, feedbackSummarySchema, (req) => coachText(buildSummaryPrompt(req)))

  handle(IPC.plannerPlanTasks, planRequestSchema, async (req): Promise<PlanResult> => {
    const skill = (await deps.loadSkill('project-planner')) ?? ''
    const result = await completeText(
      deps.getProvider(),
      {
        prompt: buildPlanPrompt(req),
        systemPrompt: `${skill}\n\nTrả lời bằng tiếng Việt trong các trường văn bản. Chỉ trả về đúng một khối JSON.`,
        mode: 'project',
        cwd: deps.workspaceDir,
        ephemeral: true
      },
      AbortSignal.timeout(PLAN_TIMEOUT_MS)
    )
    if ('error' in result) return { error: result.error }
    const tasks = parsePlan(result.text, req.members.map((m) => m.id))
    if (!tasks) {
      deps.log.warn(`Chia việc: đầu ra sai định dạng: ${result.text.slice(0, 300)}`)
      return { error: 'invalid_output' }
    }
    return { tasks }
  })
}
