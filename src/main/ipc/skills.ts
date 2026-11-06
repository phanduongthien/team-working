import { dialog, shell, type BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import { skillNameSchema, styleNoteSchema, type StyleLearnResult } from '@shared/skills'
import type { SkillStore } from '../skills/store'
import type { HandleFn } from './register'

export type SkillsIpcDeps = {
  handle: HandleFn
  store: SkillStore
  userDir: string
  getWindow(): BrowserWindow | null
  learnStyle(): Promise<StyleLearnResult>
  /** Chỉ cho e2e ở bản chưa đóng gói: đường dẫn thay cho hộp thoại chọn file. */
  fakePick?: () => string
}

const none = z.undefined()
const tokenSchema = z.string().uuid()

export function registerSkillsIpc(deps: SkillsIpcDeps): void {
  const { handle, store } = deps
  handle(IPC.skillsList, none, () => store.list())
  handle(
    IPC.skillsGet,
    z.object({ source: z.enum(['builtin', 'user']), name: skillNameSchema }),
    ({ source, name }) => store.get(source, name)
  )
  handle(IPC.skillsPick, z.enum(['folder', 'zip']), async (kind) => {
    let path = deps.fakePick?.()
    if (!path) {
      const options: Electron.OpenDialogOptions =
        kind === 'folder'
          ? { properties: ['openDirectory'] }
          : { properties: ['openFile'], filters: [{ name: 'Skill (.zip)', extensions: ['zip'] }] }
      const win = deps.getWindow()
      const picked = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (picked.canceled || !picked.filePaths[0]) return null
      path = picked.filePaths[0]
    }
    return store.preview(path)
  })
  handle(IPC.skillsInstall, tokenSchema, (token) => store.install(token))
  handle(IPC.skillsCancelPreview, tokenSchema, (token) => store.cancelPreview(token))
  handle(IPC.skillsRemove, skillNameSchema, (name) => store.remove(name))
  handle(
    IPC.skillsSetEnabled,
    z.object({ name: skillNameSchema, enabled: z.boolean() }),
    ({ name, enabled }) => store.setEnabled(name, enabled)
  )
  handle(IPC.skillsOpenFolder, none, async () => {
    await mkdir(deps.userDir, { recursive: true })
    await shell.openPath(deps.userDir)
  })
  handle(IPC.skillsStyleNotes, none, () => store.styleNotes())
  handle(IPC.skillsSetStyleNotes, z.array(styleNoteSchema).max(100), (notes) =>
    store.setStyleNotes(notes)
  )
  handle(IPC.skillsLearnStyle, none, () => deps.learnStyle())
}
