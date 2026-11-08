import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Conversation, FolderAccessClosed, FolderAccessRequest, FolderAccessResult } from '@shared/types'
import type { AppToolRegistry, ToolSet } from '../tools/registry'

type Verdict = { granted: true; path: string; write: boolean } | { granted: false; reason: string }
type Pending = FolderAccessRequest & { resolve(v: Verdict): void; timer: ReturnType<typeof setTimeout> }

export type FolderAccessDeps = {
  getConversation(id: string): Conversation | null
  /** Mở hộp chọn thư mục (gợi ý sẵn đường dẫn); null = người dùng huỷ. */
  pickFolder(suggestedPath: string | null): Promise<string | null>
  /** Gắn thư mục + quyền sửa cho hội thoại (đổi thư mục luôn reset quyền sửa trước). */
  grant(conversationId: string, path: string, write: boolean): Conversation | null
  emit(event: FolderAccessRequest | FolderAccessClosed): void
  log: { info(msg: string): void }
  timeoutMs?: number
}

const TIMEOUT_MS = 10 * 60 * 1000
export const FOLDER_TOOL = 'request_folder_access'

const input = z.object({
  path: z.string().max(1000).optional().describe('Đường dẫn người dùng nhắc tới (vd D:\\unity\\3DCo_Ban), nếu có.'),
  write: z.boolean().default(false).describe('true nếu cần SỬA file (mỗi thay đổi người dùng vẫn duyệt diff); chỉ đọc thì false.'),
  reason: z.string().min(1).max(300).describe('Một câu ngắn: cần thư mục này để làm gì.')
})

const NO_FOLDER_CONTEXT = `## Truy cập thư mục trên máy
Bạn CHƯA đọc được file trên máy người dùng. Khi người dùng nhắc tới file / thư mục / dự án trên máy (code, Unity, Blender, DaVinci…) hoặc muốn bạn xem / sửa nó: gọi ${FOLDER_TOOL} (kèm path nếu họ nêu) — KHÔNG bảo họ copy-dán và KHÔNG nói là không làm được. Người dùng sẽ tự chọn thư mục để cấp quyền.`

const READ_ONLY_CONTEXT = `Nếu cần sửa file mà đang chỉ có quyền đọc: gọi ${FOLDER_TOOL} với write=true.`

/**
 * Trợ lý tự xin quyền thư mục: tool `request_folder_access` hiện thẻ cho người dùng; quyền chỉ có khi
 * người dùng TỰ chọn thư mục trong hộp thoại của hệ điều hành (đường dẫn trợ lý đưa chỉ là gợi ý) —
 * nên nội dung lạ (web, email…) không thể khiến trợ lý tự mở thư mục.
 * Tool CLI cố định theo từng lượt → quyền mới có hiệu lực từ lượt sau; renderer tự gửi lượt "tiếp tục".
 */
export class FolderAccessRequests {
  private pending = new Map<string, Pending>()

  constructor(private readonly deps: FolderAccessDeps) {}

  /** Tool + hướng dẫn cho lượt chat; đã có quyền sửa → không cần tool. */
  toolsFor(conversationId: string): ToolSet | null {
    const conv = this.deps.getConversation(conversationId)
    if (!conv || (conv.cwd && conv.codeWrite)) return null
    return { names: [FOLDER_TOOL], context: conv.cwd ? READ_ONLY_CONTEXT : NO_FOLDER_CONTEXT }
  }

  registerTools(registry: AppToolRegistry): void {
    registry.register({
      name: FOLDER_TOOL,
      description:
        'Xin người dùng quyền đọc (write=false) hoặc đọc + sửa (write=true) một thư mục trên máy. Người dùng tự chọn thư mục; ' +
        'quyền có hiệu lực từ lượt sau — khi được cấp, kết thúc câu trả lời bằng một câu ngắn, app sẽ tự tiếp tục.',
      input,
      available: (ctx) => this.toolsFor(ctx.conversationId) !== null,
      run: async (args, ctx) => {
        const verdict = await this.request(ctx.conversationId, {
          suggestedPath: args.path?.trim() || null,
          write: args.write,
          reason: args.reason
        })
        if (!verdict.granted) return { content: [{ type: 'text', text: verdict.reason }] }
        const level = verdict.write ? 'đọc + sửa (mỗi thay đổi người dùng duyệt diff)' : 'chỉ đọc'
        return {
          content: [
            {
              type: 'text',
              text:
                `Người dùng đã cấp quyền ${level} thư mục: ${verdict.path}. Công cụ đọc/sửa file có từ lượt sau. ` +
                'Hãy KẾT THÚC câu trả lời ngay bằng một câu ngắn (vd "Có quyền rồi, mình xem ngay nhé") — app sẽ tự gửi lượt tiếp theo.'
            }
          ]
        }
      }
    })
  }

  request(conversationId: string, req: Omit<FolderAccessRequest, 'id' | 'conversationId'>): Promise<Verdict> {
    // Mỗi hội thoại chỉ một thẻ xin quyền cùng lúc.
    this.cancelConversation(conversationId)
    const id = randomUUID()
    return new Promise<Verdict>((resolve) => {
      const timer = setTimeout(
        () => this.settle(id, { granted: false, reason: 'Hết thời gian chờ người dùng cấp quyền.' }),
        this.deps.timeoutMs ?? TIMEOUT_MS
      )
      const full: FolderAccessRequest = { id, conversationId, ...req }
      this.pending.set(id, { ...full, resolve, timer })
      this.deps.emit(full)
    })
  }

  /** Người dùng bấm Từ chối, hoặc Chọn thư mục (mở hộp thoại; huỷ hộp thoại → thẻ vẫn chờ). */
  async respond(id: string, grant: boolean, write: boolean): Promise<FolderAccessResult> {
    const p = this.pending.get(id)
    if (!p) return { status: 'expired' }
    if (!grant) {
      this.settle(id, { granted: false, reason: 'Người dùng từ chối cấp quyền thư mục. Đừng hỏi lại trong lượt này.' })
      return { status: 'denied' }
    }
    const path = await this.deps.pickFolder(p.suggestedPath)
    if (!path) return { status: 'pending' }
    // Trong lúc mở hộp thoại, lượt chat có thể đã dừng.
    if (!this.pending.has(id)) return { status: 'expired' }
    const conversation = this.deps.grant(p.conversationId, path, write)
    if (!conversation) {
      this.settle(id, { granted: false, reason: 'Không tìm thấy cuộc trò chuyện.' })
      return { status: 'expired' }
    }
    this.deps.log.info(`Cấp quyền thư mục (${write ? 'đọc + sửa' : 'chỉ đọc'}) cho hội thoại ${p.conversationId}`)
    this.settle(id, { granted: true, path, write })
    return { status: 'granted', conversation }
  }

  cancelConversation(conversationId: string): void {
    for (const [id, p] of this.pending)
      if (p.conversationId === conversationId) this.settle(id, { granted: false, reason: 'Đã dừng.' })
  }

  cancelAll(): void {
    for (const id of [...this.pending.keys()]) this.settle(id, { granted: false, reason: 'App đang đóng.' })
  }

  private settle(id: string, v: Verdict): void {
    const p = this.pending.get(id)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(id)
    // Luôn báo đóng thẻ (hết giờ, dừng lượt…) để thẻ không treo; renderer bỏ qua nếu đã đóng.
    this.deps.emit({ id, closed: true })
    p.resolve(v)
  }
}
