import { writeFile } from 'node:fs/promises'
import { dialog, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import {
  DEFAULT_WORKDAY,
  TIME_ENTRY_KINDS,
  dayPlanRequestSchema,
  idSchema,
  learningPathRequestSchema,
  memoryCategorySchema,
  memoryContentSchema,
  quizGradeRequestSchema,
  quizRequestSchema,
  reportRequestSchema,
  timeManualSchema,
  timeRangeSchema,
  timeStartSchema,
  timeUpdateSchema,
  workdaySchema,
  type TextResult
} from '@shared/schemas'
import { toCsv } from '@shared/timesheet'
import type { CodeApprovalRequest } from '@shared/types'
import { completeText, type AIProvider } from '../ai/AIProvider'
import {
  buildDayPlanPrompt,
  buildGradePrompt,
  buildLearningPathPrompt,
  buildQuizPrompt,
  buildReportPrompt,
  parseDayPlan,
  parseGrade,
  parseLearningPath,
  parseQuiz
} from '../assistant/study'
import type { CodeApprovals } from '../code/approvals'
import type { ConversationRepository, SettingsRepository } from '../db/repositories'
import type { TimeRepository } from '../db/timeRepository'
import { cleanText } from '../feedback/prompts'
import type { MemoryService } from '../memory/memoryService'
import type { HandleFn } from './register'

export type WorkIpcDeps = {
  handle: HandleFn
  conversations: ConversationRepository
  settings: SettingsRepository
  time: TimeRepository
  approvals: CodeApprovals
  memory: MemoryService
  getProvider(): AIProvider
  loadSkill(name: string): Promise<string | undefined>
  workspaceDir: string
  getWindow(): BrowserWindow | null
  log: { warn(msg: string): void }
}

const AI_TIMEOUT_MS = 240_000

/** IPC: chế độ Code (thư mục, quyền sửa, duyệt), chấm công, AI học tập & kế hoạch ngày. */
export function registerWorkIpc(deps: WorkIpcDeps): void {
  const { handle } = deps
  const none = z.undefined()
  const notifyTime = (): void => deps.getWindow()?.webContents.send(IPC.timeChanged)

  /** Gọi skill một lượt (không lưu session), trả text thô. */
  const ask = async (skill: string, prompt: string, extraSystem = ''): Promise<{ text: string } | { error: string }> =>
    completeText(
      deps.getProvider(),
      { prompt, systemPrompt: `${(await deps.loadSkill(skill)) ?? ''}${extraSystem}`, mode: 'study', cwd: deps.workspaceDir, ephemeral: true },
      AbortSignal.timeout(AI_TIMEOUT_MS)
    )

  const parsed = <T>(text: string, value: T | null, what: string): T | { error: string } => {
    if (value === null) {
      deps.log.warn(`${what}: đầu ra sai định dạng: ${text.slice(0, 300)}`)
      return { error: 'invalid_output' }
    }
    return value
  }

  // ---- Chế độ Code ----
  handle(IPC.codeChooseFolder, idSchema, async (conversationId) => {
    const win = deps.getWindow()
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory'] }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || !picked.filePaths[0]) return null
    deps.approvals.cancelConversation(conversationId)
    return deps.conversations.setCwd(conversationId, picked.filePaths[0])
  })
  handle(IPC.codeSetWrite, z.object({ conversationId: idSchema, enabled: z.boolean() }), ({ conversationId, enabled }) => {
    const conv = deps.conversations.get(conversationId)
    if (!conv?.cwd) throw new Error('no_project_folder')
    if (!enabled) deps.approvals.cancelConversation(conversationId)
    return deps.conversations.setCodeWrite(conversationId, enabled)
  })
  handle(IPC.codeRespond, z.object({ id: idSchema, allow: z.boolean() }), ({ id, allow }) => {
    deps.approvals.respond(id, allow)
  })

  // ---- Chấm công ----
  handle(IPC.timeCurrent, none, () => deps.time.current())
  handle(IPC.timeStart, timeStartSchema, ({ kind, ...ref }) => {
    const entry = deps.time.start(ref, kind)
    notifyTime()
    return entry
  })
  handle(IPC.timeStop, none, () => {
    const entry = deps.time.stop()
    notifyTime()
    return entry
  })
  handle(IPC.timeList, timeRangeSchema, ({ from, to }) => deps.time.list(from, to))
  handle(IPC.timeAddManual, timeManualSchema, (input) => {
    const entry = deps.time.addManual(input)
    notifyTime()
    return entry
  })
  handle(IPC.timeUpdate, timeUpdateSchema, ({ id, ...patch }) => {
    const entry = deps.time.update(id, patch)
    if (!entry) throw new Error('entry_not_found')
    notifyTime()
    return entry
  })
  handle(IPC.timeRemove, idSchema, (id) => {
    deps.time.remove(id)
    notifyTime()
  })
  const label = z.string().max(40)
  handle(
    IPC.timeExportCsv,
    z.object({
      from: z.number().int(),
      to: z.number().int(),
      headers: z.object({ date: label, start: label, end: label, hours: label, task: label, project: label, kind: label, note: label }),
      kinds: z.record(z.enum(TIME_ENTRY_KINDS), label)
    }),
    async ({ from, to, headers, kinds }) => {
      const win = deps.getWindow()
      const options: Electron.SaveDialogOptions = {
        defaultPath: `timesheet-${new Date(from).toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      }
      const target = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (target.canceled || !target.filePath) return null
      await writeFile(target.filePath, toCsv(deps.time.list(from, to), headers, (k) => kinds[k] ?? k), 'utf8')
      return target.filePath
    }
  )
  handle(IPC.settingsGetWorkday, none, () => deps.settings.get('workday', workdaySchema, DEFAULT_WORKDAY))
  handle(IPC.settingsSetWorkday, workdaySchema, (w) => deps.settings.set('workday', w))

  // ---- Học tập ----
  handle(IPC.learningPath, learningPathRequestSchema, async (req) => {
    const res = await ask('study-tutor', buildLearningPathPrompt(req))
    if ('error' in res) return res
    const steps = parsed(res.text, parseLearningPath(res.text, req.today), 'Lộ trình học')
    return 'error' in steps ? steps : { steps }
  })
  handle(IPC.learningQuiz, quizRequestSchema, async (req) => {
    const res = await ask('study-tutor', buildQuizPrompt(req))
    if ('error' in res) return res
    const questions = parsed(res.text, parseQuiz(res.text), 'Quiz')
    return 'error' in questions ? questions : { questions }
  })
  handle(IPC.learningGrade, quizGradeRequestSchema, async (req) => {
    const res = await ask('study-tutor', buildGradePrompt(req))
    if ('error' in res) return res
    return parsed(res.text, parseGrade(res.text, req), 'Chấm quiz')
  })
  handle(IPC.memorySuggest, z.object({ content: memoryContentSchema, category: memoryCategorySchema }), ({ content, category }) =>
    deps.memory.suggest(content, category)
  )

  // ---- Kế hoạch ngày & báo cáo ----
  handle(IPC.plannerDay, dayPlanRequestSchema, async (req) => {
    const res = await ask('time-manager', buildDayPlanPrompt(req))
    if ('error' in res) return res
    const blocks = parsed(res.text, parseDayPlan(res.text, req), 'Kế hoạch ngày')
    return 'error' in blocks ? blocks : { blocks }
  })
  handle(IPC.plannerReport, reportRequestSchema, async (req): Promise<TextResult> => {
    const res = await ask('time-manager', buildReportPrompt(req))
    return 'error' in res ? res : { text: cleanText(res.text) }
  })
}

export function emitApproval(win: BrowserWindow | null, request: CodeApprovalRequest): void {
  win?.webContents.send(IPC.codeApproval, request)
  // Đang ở cửa sổ khác → đưa app lên để người dùng duyệt.
  if (win && !win.isFocused()) win.flashFrame(true)
}
