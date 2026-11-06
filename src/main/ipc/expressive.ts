import { shell } from 'electron'
import { z } from 'zod'
import {
  expressiveSettingsSchema,
  mediaRefSchema,
  recentKindSchema,
  recentUseSchema
} from '@shared/expressive'
import { IPC } from '@shared/ipc'
import { expressiveSearchSchema, giphyKeySchema } from '@shared/schemas'
import type { ExpressiveService } from '../expressive/service'
import type { SecretStore } from '../services/secrets'
import type { HandleFn } from './register'

export type ExpressiveIpcDeps = {
  handle: HandleFn
  expressive: ExpressiveService
  /** Key GIPHY người dùng dán, mã hoá DPAPI. */
  giphyKey: SecretStore
}

const none = z.undefined()

export function registerExpressiveIpc({ handle, expressive, giphyKey }: ExpressiveIpcDeps): void {
  handle(IPC.expressiveStatus, none, () => expressive.status())
  const E = { changes: 'expressive' } as const
  handle(IPC.expressiveSetSettings, expressiveSettingsSchema, (value) => expressive.setSettings(value), E)
  handle(IPC.expressiveResetAuto, none, () => expressive.resetAuto(), E)
  handle(
    IPC.expressiveSetGiphyKey,
    giphyKeySchema,
    (key) => {
      try {
        if (key) giphyKey.set(key)
        else giphyKey.clear()
        return expressive.status()
      } catch (err) {
        return { error: (err as Error).message }
      }
    },
    E
  )
  handle(IPC.expressiveSearch, expressiveSearchSchema, ({ kind, query, offset }) =>
    expressive.search(kind, query, offset)
  )
  handle(IPC.expressiveStickers, none, () => expressive.stickers())
  handle(IPC.expressiveStickerData, z.string().min(1).max(300), (id) => expressive.stickerData(id))
  handle(IPC.expressiveOpenStickers, none, async () => {
    expressive.ensureStickersDir()
    await shell.openPath(expressive.status().stickersDir)
  })
  handle(IPC.expressiveFavorites, none, async () => ({
    refs: expressive.favoriteRefs(),
    items: await expressive.favorites()
  }))
  handle(IPC.expressiveToggleFavorite, mediaRefSchema, (ref) => expressive.toggleFavorite(ref), E)
  const R = { changes: 'expressiveRecent' } as const
  handle(IPC.expressiveRecent, none, () => expressive.recent())
  handle(IPC.expressiveUseRecent, recentUseSchema, ({ emoji }) => expressive.recordEmoji(emoji), R)
  handle(IPC.expressiveClearRecent, recentKindSchema, (kind) => expressive.clearRecent(kind), R)
}
