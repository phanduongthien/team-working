import { create } from 'zustand'
import type { Artifact } from '@shared/artifacts'
import { api } from '@renderer/lib/api'

type ArtifactsState = {
  open: boolean
  conversationId: string | null
  list: Artifact[]
  selected: { id: string; version: number } | null
  setOpen(open: boolean): void
  load(conversationId: string | null): Promise<void>
  /** Mở artifact (mặc định bản mới nhất). */
  show(id: string, version?: number): Promise<void>
}

export const useArtifacts = create<ArtifactsState>((set, get) => ({
  open: false,
  conversationId: null,
  list: [],
  selected: null,
  setOpen: (open) => set({ open }),
  async load(conversationId) {
    const list = conversationId ? await api.artifacts.list(conversationId) : []
    const sel = get().selected
    const prev = sel && get().list.find((a) => a.id === sel.id)
    const keep = sel && list.find((a) => a.id === sel.id)
    // Đang xem bản mới nhất mà có bản mới hơn (trợ lý vừa sửa) → chuyển sang bản mới.
    if (sel && keep && prev && sel.version === prev.version) sel.version = keep.version
    set({
      conversationId,
      list,
      selected:
        keep && sel ? { ...sel } : list[0] ? { id: list[0].id, version: list[0].version } : null
    })
  },
  async show(id, version) {
    const { conversationId } = get()
    if (conversationId) await get().load(conversationId)
    const a = get().list.find((x) => x.id === id)
    if (a) set({ open: true, selected: { id, version: version ?? a.version } })
  }
}))
