import { create } from 'zustand'
import { MAX_ATTACHMENT_UPLOAD_BYTES, MAX_ATTACHMENTS } from '@shared/schemas'
import type { Attachment, PickAttachmentsResult } from '@shared/types'
import { api } from '@renderer/lib/api'

export type DraftProblem = { name?: string; reason: string }

type DraftStore = {
  items: Attachment[]
  problems: DraftProblem[]
  busy: boolean
  /** File từ kéo thả / Ctrl+V (trình duyệt đưa ra File) — gửi nội dung sang main. */
  addFiles(files: File[]): Promise<void>
  /** Ctrl+V khi trình duyệt không đưa ra File (vd file copy từ Explorer) — main tự đọc clipboard. */
  addFromClipboard(): Promise<void>
  /** Nút đính kèm: hộp thoại chọn file của main. */
  pick(): Promise<void>
  remove(id: string): void
  clear(): void
}

/**
 * Đính kèm đang soạn (chưa gửi). Dùng chung cho nút đính kèm, dán và kéo thả — vùng thả là cả khung
 * chat nên trạng thái phải nằm ngoài Composer.
 */
export const useDraft = create<DraftStore>((set, get) => {
  const merge = (res: PickAttachmentsResult, extra: DraftProblem[] = []): void => {
    const room = MAX_ATTACHMENTS - get().items.length
    const accepted = res.attachments.slice(0, Math.max(0, room))
    const problems: DraftProblem[] = [...extra, ...res.rejected]
    if (res.attachments.length > accepted.length) problems.push({ reason: 'too_many' })
    set((s) => ({ items: [...s.items, ...accepted], problems }))
  }
  const run = async (task: () => Promise<void>): Promise<void> => {
    set({ busy: true })
    try {
      await task()
    } catch (err) {
      set({ problems: [{ reason: (err as Error).message }] })
    } finally {
      set({ busy: false })
    }
  }

  return {
    items: [],
    problems: [],
    busy: false,
    async addFiles(files) {
      await run(async () => {
        const result: PickAttachmentsResult = { attachments: [], rejected: [] }
        const room = MAX_ATTACHMENTS - get().items.length
        const tooMany = files.length > room
        // Gửi từng file để mỗi lần truyền IPC có giới hạn; file quá lớn bị chặn trước khi đọc.
        for (const file of files.slice(0, Math.max(0, room))) {
          if (file.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
            result.rejected.push({ name: file.name, reason: 'too_large' })
            continue
          }
          const res = await api.chat.addFile(file.name || 'file', new Uint8Array(await file.arrayBuffer()))
          result.attachments.push(...res.attachments)
          result.rejected.push(...res.rejected)
        }
        merge(result, tooMany ? [{ reason: 'too_many' }] : [])
      })
    },
    async addFromClipboard() {
      await run(async () => merge(await api.chat.pasteClipboard()))
    },
    async pick() {
      await run(async () => merge(await api.chat.pickAttachments()))
    },
    remove: (id) => set((s) => ({ items: s.items.filter((a) => a.id !== id), problems: [] })),
    clear: () => set({ items: [], problems: [] })
  }
})

/**
 * Ctrl+V có nên lấy file/ảnh thay vì dán chữ không. Có chữ → dán chữ như cũ (vd copy từ Word kèm ảnh
 * minh hoạ vẫn là dán chữ). Không có chữ mà có file hoặc ảnh → đính kèm.
 */
export function pasteKind(data: Pick<DataTransfer, 'types' | 'files' | 'getData'>): 'text' | 'files' | 'clipboard' {
  if (data.getData('text/plain')) return 'text'
  if (data.files.length > 0) return 'files'
  if (data.types.some((t) => t === 'Files' || t.startsWith('image/') || t === 'text/uri-list')) return 'clipboard'
  return 'text'
}

/** Kéo vào khung chat có mang file không (chỉ khi đó mới hiện vùng thả). */
export const dragHasFiles = (types: readonly string[]): boolean => types.includes('Files')
